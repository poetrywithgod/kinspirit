// Calls. One call at a time; it lives outside React so it keeps going while you move around the app.
import { useSyncExternalStore } from 'react'
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type Participant,
  type RemoteTrack,
  type VideoTrack,
} from 'livekit-client'
import { dataSaver } from './dataSaver'
import { ApiError, type CallPass, answerCall, inviteToCall, callHost, callPass, callRow, callStatus, endCall, startCallRpc } from './api'
import { addLocalAudio } from './library'
import { EXTENSION, LABEL, RECORDER_TYPES, getRecFormat, resolveRecFormat, type RecFormat } from './recfmt'
import { canEncodeMp3, startMp3, type Mp3Stream } from './mp3'

export type Row = { id: string; name: string; muted: boolean; speaking: boolean; host: boolean; me: boolean; away: boolean; video: boolean }
export type CallState = {
  phase: 'idle' | 'connecting' | 'live'
  dial: 'none' | 'calling' | 'ringing' // the caller is waiting for the other side
  callId: string
  isCaller: boolean
  direct: boolean
  meeting: boolean // a scheduled meeting: people join with a link, nobody is rung
  open: boolean // the full call screen is showing
  cid: string
  title: string
  role: 'host' | 'member'
  micOn: boolean
  camOn: boolean
  canSpeak: boolean
  locked: boolean
  people: Row[]
  startedAt: number
  recording: boolean
  recordingBy: string
  recKind: '' | 'audio' | 'screen'
  speaker: string
  reconnecting: boolean // my own connection dropped and is being restored
  peerAway: boolean // the other person dropped out; waiting for them to come back
  needsSound: boolean // the browser is holding back call sound until a tap
  notice: string
  error: string
}

const idle: CallState = {
  phase: 'idle',
  dial: 'none',
  callId: '',
  isCaller: false,
  direct: false,
  meeting: false,
  open: false,
  cid: '',
  title: '',
  role: 'member',
  micOn: false,
  camOn: false,
  canSpeak: true,
  locked: false,
  people: [],
  startedAt: 0,
  recording: false,
  recordingBy: '',
  recKind: '',
  speaker: '',
  reconnecting: false,
  peerAway: false,
  needsSound: false,
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
let peerGone = 0
let wake: WakeLockSentinel | null = null
let micWanted = false // I want my mic on (not switched off by me)
const awayIds = new Set<string>() // people who switched to another app (their phone pauses their mic)
let rejoining = false
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
        away: awayIds.has(p.identity),
        video: p.isCameraEnabled,
      }))
      .sort((a, b) => Number(b.me) - Number(a.me) || Number(b.host) - Number(a.host) || a.name.localeCompare(b.name))
    if (people.length > 1) peerSeen = true
    // One-to-one: if the other person disappears (closed the app, lost signal, refreshed the page) wait a while
    // for them to come back before calling it over. Pressing End ends it at once (see watchEnded).
    if (st.direct && peerSeen && people.length === 1 && st.phase === 'live') {
      if (!peerGone) {
        peerGone = window.setTimeout(() => {
          peerGone = 0
          if (st.phase === 'live' && st.people.length <= 1) {
            if (st.callId) void endCall(st.callId).catch(() => undefined)
            cleanup('The call ended.')
          }
        }, 30000)
        set({ peerAway: true })
      }
    } else if (people.length > 1 && peerGone) {
      window.clearTimeout(peerGone)
      peerGone = 0
      set({ peerAway: false })
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
      camOn: room.localParticipant.isCameraEnabled,
      canSpeak: room.localParticipant.permissions?.canPublish !== false,
    })
  }, 120)
}

function cleanup(reason = '') {
  micWanted = false
  awayIds.clear()
  window.clearTimeout(refreshTimer)
  window.clearTimeout(peerGone)
  peerGone = 0
  stopWatch()
  peerSeen = false
  rejoining = false
  forgetCall()
  void wake?.release().catch(() => {})
  wake = null
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

export type CallTarget = { id: string; name: string; kind?: 'direct' | 'group'; meeting?: boolean }

const KEEP = 'kinspirit.activecall'
/** Remember the running call so a refresh (or the browser closing the page) does not lose it. */
function rememberCall() {
  try {
    localStorage.setItem(KEEP, JSON.stringify({ cid: st.cid, title: st.title, direct: st.direct, meeting: st.meeting, callId: st.callId, at: Date.now() }))
  } catch {
    /* storage blocked */
  }
}
function forgetCall() {
  try {
    localStorage.removeItem(KEEP)
  } catch {
    /* storage blocked */
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Networks on phones hiccup. Try twice more before telling the person it failed. */
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500) throw e // a real "no", not a hiccup
      await wait(700 * (i + 1))
    }
  }
  throw last
}

async function holdScreenAwake() {
  try {
    if (!wake && 'wakeLock' in navigator) {
      wake = await navigator.wakeLock.request('screen')
      wake.addEventListener('release', () => {
        wake = null
      })
    }
  } catch {
    /* not allowed right now */
  }
}
/** Tell the others I left / came back to the app (phones pause the microphone while an app is in the background). */
function announceAway(away: boolean) {
  void room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ away })), { reliable: true, topic: 'away' }).catch(() => {})
}

/** After coming back to the app: if the browser paused or dropped my microphone, switch it on again. */
async function ensureMic(showNote: boolean) {
  if (!room || !micWanted || !st.canSpeak || st.phase !== 'live') return
  const broken = () => {
    const t = room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
    return !t || t.isMuted || t.mediaStreamTrack.readyState === 'ended' || t.mediaStreamTrack.muted
  }
  await wait(700) // the browser needs a moment to hand the microphone back
  if (!broken()) return
  try {
    await room.localParticipant.setMicrophoneEnabled(false)
    await room.localParticipant.setMicrophoneEnabled(true)
    if (showNote) set({ notice: 'Welcome back. Your microphone is on again.' })
  } catch {
    set({ notice: 'Your phone stopped the microphone while Kinspirit was in the background. Tap Mute, then the mic again to speak.' })
  }
  refresh()
}

document.addEventListener('visibilitychange', () => {
  if (st.phase === 'idle') return
  if (document.visibilityState === 'hidden') return announceAway(true)
  announceAway(false)
  void holdScreenAwake()
  void room?.startAudio().catch(() => {})
  void ensureMic(true)
  refresh()
})

/** Opens the room: gets a pass, connects and wires up events. Used for joining and for coming back after a drop. */
async function openRoom(cid: string): Promise<CallPass> {
  const pass = await retry(() => callPass(cid))
  const r = new Room({
    dynacast: true,
    adaptiveStream: false,
    publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  room = r

  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video) return refresh() // shown by the video tiles on the call screen
    if (track.kind !== Track.Kind.Audio) return
    const el = track.attach()
    el.style.display = 'none'
    document.body.appendChild(el)
    audioEls.set(track.sid ?? String(audioEls.size), el)
    mixTrack(track.sid ?? '', track.mediaStreamTrack)
  })
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video) return refresh()
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

  // My own connection wobbling: the library reconnects by itself; just say so.
  r.on(RoomEvent.Reconnecting, () => room === r && set({ reconnecting: true }))
  r.on(RoomEvent.SignalReconnecting, () => room === r && set({ reconnecting: true }))
  r.on(RoomEvent.Reconnected, () => {
    if (room !== r) return
    set({ reconnecting: false })
    void r.startAudio().catch(() => {})
    refresh()
  })
  // Browsers hold back sound until a tap (this happens after a page refresh).
  r.on(RoomEvent.AudioPlaybackStatusChanged, () => room === r && set({ needsSound: !r.canPlaybackAudio }))

  r.on(RoomEvent.DataReceived, (payload, from, _kind, topic) => {
    if (topic === 'away' && from) {
      try {
        const d = JSON.parse(new TextDecoder().decode(payload)) as { away: boolean }
        if (d.away) awayIds.add(from.identity)
        else awayIds.delete(from.identity)
        refresh()
      } catch {
        /* ignore bad data */
      }
      return
    }
    if (topic !== 'rec') return
    try {
      const d = JSON.parse(new TextDecoder().decode(payload)) as { on: boolean }
      set({ recording: d.on, recordingBy: d.on ? (from?.name ?? 'The host') : '' })
    } catch {
      /* ignore bad data */
    }
  })
  r.on(RoomEvent.ParticipantDisconnected, (p) => {
    awayIds.delete(p.identity)
  })
  r.on(RoomEvent.Disconnected, (reason) => {
    if (room !== r) return
    if (reason === DisconnectReason.PARTICIPANT_REMOVED) return cleanup('You were removed from the call.')
    if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.CLIENT_INITIATED) return cleanup('The call ended.')
    void comeBack() // dropped by the network or the server: get back in
  })

  await r.connect(pass.url, pass.token, { autoSubscribe: true })
  await r.startAudio().catch(() => {})
  set({ needsSound: !r.canPlaybackAudio })
  return pass
}

/** The connection was lost for good: build a new one, a few times, before giving up. */
async function comeBack() {
  if (rejoining || st.phase === 'idle') return
  rejoining = true
  const wantMic = st.micOn
  set({ reconnecting: true })
  try {
    for (let i = 0; i < 6 && getCall().phase !== 'idle'; i++) {
      try {
        const old = room
        room = null
        void old?.disconnect()
        const pass = await openRoom(st.cid)
        if (wantMic && (pass.role === 'host' || !pass.locked)) {
          micWanted = true
          await room!.localParticipant.setMicrophoneEnabled(true).catch(() => {})
        }
        set({ reconnecting: false, role: pass.role, locked: pass.locked })
        refresh()
        rejoining = false
        return
      } catch (e) {
        if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500) break // not allowed back in
        await wait(2000 * (i + 1))
      }
    }
  } finally {
    rejoining = false
  }
  if (getCall().phase !== 'idle') cleanup('You lost connection and the call ended.')
}

/** Join the call for this chat. As the caller (`opts.caller`) this also starts ringing the others. */
export async function joinCall(chat: CallTarget, opts: { caller?: boolean; callId?: string; resume?: boolean } = {}) {
  if (st.phase !== 'idle') {
    if (st.cid === chat.id) return set({ open: true })
    return set({ error: 'You are already in another call. Leave it first.', open: false })
  }
  set({ ...idle, phase: 'connecting', open: true, cid: chat.id, title: chat.name, direct: chat.kind !== 'group', meeting: !!chat.meeting, callId: opts.callId ?? '' })
  try {
    // Get the pass first: if calls are not working, nobody is rung for nothing.
    const pass = await openRoom(chat.id)
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
    set({ phase: 'live', role: pass.role, startedAt: Date.now(), locked: pass.locked })
    void holdScreenAwake()
    if (pass.role === 'host' || !pass.locked) {
      micWanted = true
      await room!.localParticipant.setMicrophoneEnabled(true).catch(() => {
        micWanted = false
        set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
      })
      if (micWanted && !st.notice) set({ notice: 'Stay on Kinspirit while you talk. Your phone pauses the microphone if you switch to another app.' })
    } else {
      set({ notice: 'The host has locked microphones.' })
    }
    rememberCall()
    refresh()
    if (st.isCaller) watchCall()
    else if (st.direct && st.callId) watchEnded()
  } catch (e) {
    if (st.isCaller && st.callId) void endCall(st.callId, true).catch(() => undefined)
    cleanup(e instanceof ApiError ? e.message : 'Could not join the call. Check your internet and try again.')
  }
}

/** After a page refresh: go back into the call that was running, if it is still going. */
export async function resumeCall() {
  if (st.phase !== 'idle') return
  let saved: { cid: string; title: string; direct: boolean; meeting?: boolean; callId: string; at: number } | null = null
  try {
    saved = JSON.parse(localStorage.getItem(KEEP) ?? 'null')
  } catch {
    saved = null
  }
  if (!saved || Date.now() - saved.at > 6 * 3600_000) return forgetCall()
  try {
    const live = await callStatus(saved.cid)
    if (!live.active) return forgetCall()
    if (saved.callId) {
      const row = await callRow(saved.callId).catch(() => null)
      if (row && (row.call_status === 'ended' || row.call_status === 'missed' || row.call_status === 'declined' || row.call_status === 'cancelled')) return forgetCall()
    }
  } catch {
    return // no internet right now; keep it and try on the next start
  }
  await joinCall({ id: saved.cid, name: saved.title, kind: saved.direct ? 'direct' : 'group', meeting: saved.meeting }, { callId: saved.callId, resume: true })
}

/** One-to-one: when either person presses End, the other one's call ends too (quickly, within seconds). */
function watchEnded() {
  stopWatch()
  const id = st.callId
  watchTimer = window.setInterval(async () => {
    if (st.phase === 'idle' || st.callId !== id) return stopWatch()
    const row = await callRow(id).catch(() => null)
    if (st.callId !== id) return
    if (row && (row.call_status === 'ended' || row.call_status === 'missed' || row.call_status === 'cancelled')) cleanup('The call ended.')
  }, 3000)
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
    if (row?.call_status === 'answered' && st.dial !== 'none') {
      set({ dial: 'none' })
      if (st.direct) return watchEnded()
    }
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
  if (callId && ((direct && st.people.length <= 2) || (isCaller && dial !== 'none'))) void endCall(callId).catch(() => undefined)
  cleanup()
}

export const getCall = (): CallState => st
export const showCall = (open: boolean) => set({ open })
export const clearCallError = () => set({ error: '', notice: '' })

export async function toggleMic() {
  if (!room || !st.canSpeak) return
  try {
    const next = !room.localParticipant.isMicrophoneEnabled
    micWanted = next
    await room.localParticipant.setMicrophoneEnabled(next)
  } catch {
    set({ notice: 'Microphone is blocked. Allow it in your browser to speak.' })
  }
  refresh()
}

/** Camera on/off. Video is kept small on purpose (data is expensive): one low-resolution, low-frame-rate stream. */
export async function toggleCamera() {
  if (!room) return
  const lp = room.localParticipant
  try {
    if (lp.isCameraEnabled) {
      await lp.setCameraEnabled(false)
    } else {
      const saver = dataSaver()
      await lp.setCameraEnabled(
        true,
        { resolution: saver ? VideoPresets.h180.resolution : VideoPresets.h360.resolution, facingMode: 'user' },
        { videoEncoding: { maxBitrate: saver ? 70_000 : 150_000, maxFramerate: saver ? 10 : 15 }, simulcast: false },
      )
    }
  } catch (e) {
    const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    set({ notice: denied ? 'The camera is blocked. Allow it in your browser to share video.' : 'Could not start the camera. Check that no other app is using it.' })
  }
  refresh()
}

/** The camera picture of one person in the call (me or someone else), if their camera is on. */
export function videoTrackOf(identity: string): VideoTrack | undefined {
  if (!room) return undefined
  const p = identity === room.localParticipant.identity ? room.localParticipant : room.remoteParticipants.get(identity)
  const pub = p?.getTrackPublication(Track.Source.Camera)
  return pub && !pub.isMuted ? (pub.videoTrack as VideoTrack | undefined) : undefined
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

/**
 * Speaker button: switches where the call sound comes out (loudspeaker, earpiece, headset, Bluetooth)
 * when the browser lets apps choose. Many phones do not, and then the phone's own volume keys are used.
 */
export async function cycleSpeaker() {
  try {
    const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
    const els = [...audioEls.values()] as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> })[]
    if (list.length < 2 || !els.length || !els[0].setSinkId) {
      return set({ notice: 'This phone does not let a web app choose the speaker. Use the volume keys or a headset. A Kinspirit phone app can add this later.' })
    }
    const at = list.findIndex((d) => d.deviceId === st.speaker)
    const next = list[(at + 1) % list.length]
    await Promise.all(els.map((e) => e.setSinkId!(next.deviceId)))
    set({ speaker: next.deviceId, notice: `Sound now plays on ${next.label || 'the next speaker'}.` })
  } catch {
    set({ notice: 'Could not switch the speaker on this phone.' })
  }
}

/** "Add": ring another person into this call. They can join even if they are not in this chat. */
export async function addToCall(person: { id: string; username: string }): Promise<void> {
  if (!st.cid || st.phase === 'idle') return
  try {
    await inviteToCall(st.cid, person.id)
    set({ notice: `Ringing @${person.username}…` })
  } catch (e) {
    set({ notice: e instanceof ApiError ? e.message : 'Could not add them. Check your internet.' })
  }
}

/** Tap to hear the call (needed once after a refresh, because browsers block sound until you touch the page). */
export function enableSound() {
  void room?.startAudio().then(() => set({ needsSound: false })).catch(() => {})
}
