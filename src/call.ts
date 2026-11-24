// Calls. One call at a time; it lives outside React so it keeps going while you move around the app.
import { useSyncExternalStore } from 'react'
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from 'livekit-client'
import { ApiError, answerCall, callHost, callPass, callRow, callStatus, endCall, startCallRpc } from './api'
import { addLocalAudio } from './library'
import { EXTENSION, LABEL, RECORDER_TYPES, getRecFormat, resolveRecFormat, type RecFormat } from './recfmt'
import { canEncodeMp3, startMp3, type Mp3Stream } from './mp3'

export type Row = { id: string; name: string; muted: boolean; speaking: boolean; host: boolean; me: boolean }
export type CallState = {
  phase: 'idle' | 'connecting' | 'live'
  dial: 'none' | 'calling' | 'ringing' // the caller is waiting for the other side
  callId: string
  isCaller: boolean
  direct: boolean
  open: boolean // the full call screen is showing
  cid: string
  title: string
  role: 'host' | 'member'
  micOn: boolean
  canSpeak: boolean
  locked: boolean
  people: Row[]
  startedAt: number
  recording: boolean
  recordingBy: string
  recKind: '' | 'audio' | 'screen'
  notice: string
  error: string
}

const idle: CallState = {
  phase: 'idle',
  dial: 'none',
  callId: '',
  isCaller: false,
  direct: false,
  open: false,
  cid: '',
  title: '',
  role: 'member',
  micOn: false,
  canSpeak: true,
  locked: false,
  people: [],
  startedAt: 0,
  recording: false,
  recordingBy: '',
  recKind: '',
  notice: '',
  error: '',
}
let st: CallState = idle
const subs = new Set<() => void>()
function set(p: Partial<CallState>) {
  st = { ...st, ...p }
  subs.forEach((f) => f())
}

let room: Room | null = null
const audioEls = new Map<string, HTMLMediaElement>()
let refreshTimer = 0
let watchTimer = 0
let peerSeen = false
const stopWatch = () => window.clearInterval(watchTimer)

const roleOf = (p: Participant): 'host' | 'member' => {
  try {
    return (JSON.parse(p.metadata || '{}') as { role?: string }).role === 'host' ? 'host' : 'member'
  } catch {
    return 'member'
  }
}

function refresh() {
  if (!room) return
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    if (!room) return
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()]
    const people: Row[] = all
      .map((p) => ({
        id: p.identity,
        name: p.name || 'Guest',
        muted: !p.isMicrophoneEnabled,
        speaking: p.isSpeaking,
        host: roleOf(p) === 'host',
        me: p === room!.localParticipant,
      }))
      .sort((a, b) => Number(b.me) - Number(a.me) || Number(b.host) - Number(a.host) || a.name.localeCompare(b.name))
    if (people.length > 1) peerSeen = true
    // One-to-one: when the other person leaves, the call is over.
    if (st.direct && peerSeen && people.length === 1 && st.phase === 'live') {
      if (st.callId) void endCall(st.callId).catch(() => undefined)
      return cleanup('The call ended.')
    }
    let locked = false
    try {
      locked = (JSON.parse(room.metadata || '{}') as { locked?: boolean }).locked === true
    } catch {
      /* no metadata */
    }
    set({
      people,
      ...(people.length > 1 && st.dial !== 'none' ? { dial: 'none' as const } : {}),
      locked,
      micOn: room.localParticipant.isMicrophoneEnabled,
      canSpeak: room.localParticipant.permissions?.canPublish !== false,
    })
  }, 120)
}

function cleanup(reason = '') {
  window.clearTimeout(refreshTimer)
  stopWatch()
  peerSeen = false
  stopMixer(true)
  audioEls.forEach((el) => el.remove())
  audioEls.clear()
  const r = room
  room = null
  void r?.disconnect()
  st = { ...idle, error: reason }
  subs.forEach((f) => f())
}

// ---------- joining and leaving ----------

export type CallTarget = { id: string; name: string; kind?: 'direct' | 'group' }

/** Join the call for this chat. As the caller (`opts.caller`) this also starts ringing the others. */
export async function joinCall(chat: CallTarget, opts: { caller?: boolean; callId?: string } = {}) {
  if (st.phase !== 'idle') {
    if (st.cid === chat.id) return set({ open: true })
    return set({ error: 'You are already in another call. Leave it first.', open: false })
  }
  set({ ...idle, phase: 'connecting', open: true, cid: chat.id, title: chat.name, direct: chat.kind !== 'group', callId: opts.callId ?? '' })
  try {
    // Get the pass first: if calls are not working, nobody is rung for nothing.
    const pass = await callPass(chat.id)
    if (opts.caller) {
      const c = await startCallRpc(chat.id)
      if (!c) throw new ApiError('call_failed', 'Could not start the call. Try again.')
      if (c.mine) set({ callId: c.id, isCaller: true, dial: 'calling' })
      else {
        // The other person rang at the same moment: just answer their call.
        await answerCall(c.id).catch(() => undefined)
        set({ callId: c.id })
      }
    }
    const r = new Room({
      dynacast: true,
      publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    room = r

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const el = track.attach()
      el.style.display = 'none'
      document.body.appendChild(el)
      audioEls.set(track.sid ?? String(audioEls.size), el)
      mixTrack(track.sid ?? '', track.mediaStreamTrack)
    })
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
      audioEls.delete(track.sid ?? '')
      unmixTrack(track.sid ?? '')
    })
    for (const ev of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantPermissionsChanged,
      RoomEvent.RoomMetadataChanged,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
    ])
      r.on(ev, refresh)

    r.on(RoomEvent.DataReceived, (payload, from, _kind, topic) => {
      if (topic !== 'rec') return
      try {
        const d = JSON.parse(new TextDecoder().decode(payload)) as { on: boolean }
        set({ recording: d.on, recordingBy: d.on ? (from?.name ?? 'The host') : '' })
      } catch {
        /* ignore bad data */
      }
    })
    r.on(RoomEvent.Disconnected, (reason) => {
      if (room !== r) return
      cleanup(reason === DisconnectReason.PARTICIPANT_REMOVED ? 'You were removed from the call.' : 'The call ended.')
    })

    await r.connect(pass.url, pass.token, { autoSubscribe: true })
    await r.startAudio().catch(() => {})
    set({ phase: 'live', role: pass.role, startedAt: Date.now(), locked: pass.locked })
    if (pass.role === 'host' || !pass.locked) {
      await r.localParticipant.setMicrophoneEnabled(true).catch(() => {
        set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
      })
    } else {
      set({ notice: 'The host has locked microphones.' })
    }
    refresh()
    if (st.isCaller) watchCall()
  } catch (e) {
    if (st.isCaller && st.callId) void endCall(st.callId, true).catch(() => undefined)
    cleanup(e instanceof ApiError ? e.message : 'Could not join the call. Check your internet and try again.')
  }
}

/** While ringing: learn when the other phone is reached, when they answer or say no, and give up after 45 seconds. */
function watchCall() {
  stopWatch()
  const id = st.callId
  const t0 = Date.now()
  watchTimer = window.setInterval(async () => {
    if (st.phase === 'idle' || st.callId !== id) return stopWatch()
    const row = await callRow(id).catch(() => null)
    if (st.callId !== id) return
    if (row?.call_status === 'declined') return cleanup('They declined the call.')
    if (row?.call_status === 'missed' || row?.call_status === 'ended') return cleanup(st.dial !== 'none' ? 'No answer.' : 'The call ended.')
    if (row?.call_status === 'answered' && st.dial !== 'none') set({ dial: 'none' })
    else if (row?.call_ringing_at && st.dial === 'calling') set({ dial: 'ringing' })
    if (st.dial !== 'none' && Date.now() - t0 > 45000) {
      await endCall(id).catch(() => undefined)
      cleanup('No answer.')
    }
  }, 2000)
}

/** Starts a call: rings the others. If a call is already running in this chat, joins it instead. */
export async function startCall(chat: CallTarget) {
  if (st.phase !== 'idle') return void joinCall(chat)
  let active = false
  try {
    active = (await callStatus(chat.id)).active
  } catch (e) {
    return set({ error: e instanceof ApiError ? e.message : 'Could not start the call.' })
  }
  await joinCall(chat, active ? {} : { caller: true })
}

export function leaveCall() {
  if (st.phase === 'idle') return
  const { callId, isCaller, dial, direct } = st
  // Hanging up while it is still ringing makes it a missed call; ending a one-to-one call closes it.
  if (callId && (direct || (isCaller && dial !== 'none'))) void endCall(callId).catch(() => undefined)
  cleanup()
}

export const getCall = (): CallState => st
export const showCall = (open: boolean) => set({ open })
export const clearCallError = () => set({ error: '', notice: '' })

export async function toggleMic() {
  if (!room || !st.canSpeak) return
  try {
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
  } catch {
    set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
  }
  refresh()
}

// ---------- host controls ----------

export async function hostAction(action: 'mute_all' | 'lock_all' | 'unlock_all' | 'remove', identity?: string) {
  if (!st.cid || st.role !== 'host') return
  try {
    await callHost(st.cid, action, identity)
    set({
      notice:
        action === 'mute_all'
          ? 'Everyone has been muted.'
          : action === 'lock_all'
            ? 'Microphones locked. Only hosts can speak.'
            : action === 'unlock_all'
              ? 'Microphones unlocked.'
              : 'Person removed.',
    })
  } catch (e) {
    set({ notice: e instanceof ApiError ? e.message : 'That did not work. Try again.' })
  }
}

// ---------- recording (host, saved on this phone) ----------
// Audio: Opus, AAC or MP3 (chosen in Settings), saved in the Audio tab.
// Screen: the host's screen plus the call audio, saved as a video file in Downloads (computers only).

let ctx: AudioContext | null = null
let bus: GainNode | null = null
let dest: MediaStreamAudioDestinationNode | null = null
let mixer: MediaRecorder | null = null
let mp3: Mp3Stream | null = null
let display: MediaStream | null = null
let kind: 'audio' | 'screen' = 'audio'
let chunks: Blob[] = []
let recStarted = 0
let recFormat: RecFormat = 'opus'
const sources = new Map<string, MediaStreamAudioSourceNode>()

function mixTrack(key: string, t: MediaStreamTrack) {
  if (!ctx || !bus) return
  try {
    const src = ctx.createMediaStreamSource(new MediaStream([t]))
    src.connect(bus)
    sources.set(key, src)
  } catch {
    /* track not ready */
  }
}
function unmixTrack(key: string) {
  sources.get(key)?.disconnect()
  sources.delete(key)
}

function announceRecording(on: boolean) {
  void room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ on })), { reliable: true, topic: 'rec' })
}

export const canRecordScreen = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export async function startRecording(what: 'audio' | 'screen' = 'audio') {
  if (!room || st.role !== 'host' || mixer || mp3 || st.recording) return
  if (typeof MediaRecorder === 'undefined') return set({ notice: 'Recording is not supported on this browser.' })
  kind = what

  // Ask for the screen first: browsers only allow this right after a tap.
  if (what === 'screen') {
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
    } catch {
      return set({ notice: 'Screen recording was cancelled.' })
    }
  }

  ctx = new AudioContext()
  bus = ctx.createGain()
  dest = ctx.createMediaStreamDestination()
  bus.connect(dest)
  // A silent source keeps the recording running even when nobody is talking.
  const keep = ctx.createOscillator()
  const mute = ctx.createGain()
  mute.gain.value = 0
  keep.connect(mute).connect(bus)
  keep.start()
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.audioTrackPublications.values()) {
      if (pub.track?.mediaStreamTrack) mixTrack(pub.trackSid, pub.track.mediaStreamTrack)
    }
  }
  const mine = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
  if (mine) mixTrack('local', mine)

  chunks = []
  recStarted = Date.now()

  if (what === 'screen') {
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    const stream = new MediaStream([...display!.getVideoTracks(), ...dest.stream.getAudioTracks()])
    mixer = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64000 })
    mixer.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    display!.getVideoTracks()[0].onended = () => stopRecording() // the browser's own "Stop sharing" button
    mixer.start(2000)
  } else {
    const want = getRecFormat()
    let use = resolveRecFormat(want)
    if (use === 'mp3' && !canEncodeMp3(ctx)) use = resolveRecFormat(want === 'mp3' ? 'aac' : want) === 'mp3' ? null : resolveRecFormat(want === 'mp3' ? 'aac' : want)
    if (!use) {
      void ctx.close().catch(() => {})
      ctx = bus = dest = null
      return set({ notice: 'This phone cannot record audio in the browser.' })
    }
    recFormat = use
    if (use === 'mp3') {
      mp3 = await startMp3(ctx, bus)
    } else {
      const type = RECORDER_TYPES[use].find((t) => MediaRecorder.isTypeSupported(t))
      mixer = new MediaRecorder(dest.stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: use === 'aac' ? 48000 : 32000 })
      mixer.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      mixer.start(2000)
    }
    if (use !== want) set({ notice: `${LABEL[want]} is not available on this phone, so this call is recorded as ${LABEL[use]}.` })
  }
  set({ recording: true, recordingBy: 'You', recKind: what })
  announceRecording(true)
}

function fileLabel(title: string, when: Date) {
  return `${title} – ${when.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function saveAudioRecording(blob: Blob, ext: string, title: string, cid: string, seconds: number) {
  const when = new Date()
  void addLocalAudio(
    {
      id: `rec-${when.getTime()}`,
      name: `Call recording – ${fileLabel(title, when)}.${ext}`,
      from: 'you',
      conversation_id: cid,
      size: blob.size,
      duration: seconds,
      added_at: Date.now(),
    },
    blob,
  ).catch(() => {})
}

function downloadVideo(blob: Blob, title: string) {
  const when = new Date()
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Screen recording – ${fileLabel(title, when)}.${ext}`.replace(/[\\/:*?"<>|]/g, '-')
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

function stopMixer(save: boolean) {
  const m = mixer
  const enc = mp3
  const k = kind
  const fmt = recFormat
  const title = st.title
  const cid = st.cid
  const seconds = (Date.now() - recStarted) / 1000
  mixer = null
  mp3 = null
  const finish = () => {
    display?.getTracks().forEach((t) => t.stop())
    display = null
    sources.forEach((s) => s.disconnect())
    sources.clear()
    void ctx?.close().catch(() => {})
    ctx = null
    bus = null
    dest = null
  }
  if (enc) {
    const blob = enc.stop()
    finish()
    if (save && blob.size > 0) saveAudioRecording(blob, EXTENSION.mp3, title, cid, seconds)
    return
  }
  if (!m) return finish()
  m.onstop = () => {
    finish()
    if (!save || chunks.length === 0) return
    const blob = new Blob(chunks, { type: m.mimeType || (k === 'screen' ? 'video/webm' : 'audio/webm') })
    chunks = []
    if (k === 'screen') downloadVideo(blob, title)
    else saveAudioRecording(blob, EXTENSION[fmt], title, cid, seconds)
  }
  if (m.state !== 'inactive') m.stop()
  else m.onstop(new Event('stop'))
}

export function stopRecording() {
  if (!mixer && !mp3) return
  const k = kind
  stopMixer(true)
  set({
    recording: false,
    recordingBy: '',
    recKind: '',
    notice: k === 'screen' ? 'Screen recording saved to your Downloads.' : `Recording saved in your Audio tab as ${LABEL[recFormat]}.`,
  })
  if (room && room.state === ConnectionState.Connected) announceRecording(false)
}

// ---------- reading the state ----------

export const useCall = (): CallState =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => st,
  )

export const inCallWith = (cid: string) => st.phase !== 'idle' && st.cid === cid
