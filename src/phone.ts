// International phone numbers: a country picker plus the number, saved in +<country><number> form.
export type Country = { iso: string; name: string; dial: string }

const RAW: [string, string, string][] = [
  ['NG', "Nigeria", '234'],
  ['GH', "Ghana", '233'],
  ['KE', "Kenya", '254'],
  ['ZA', "South Africa", '27'],
  ['CM', "Cameroon", '237'],
  ['SN', "Senegal", '221'],
  ['CI', "Côte d'Ivoire", '225'],
  ['BJ', "Benin", '229'],
  ['TG', "Togo", '228'],
  ['NE', "Niger", '227'],
  ['ML', "Mali", '223'],
  ['BF', "Burkina Faso", '226'],
  ['GM', "Gambia", '220'],
  ['SL', "Sierra Leone", '232'],
  ['LR', "Liberia", '231'],
  ['GN', "Guinea", '224'],
  ['TD', "Chad", '235'],
  ['GA', "Gabon", '241'],
  ['CG', "Congo", '242'],
  ['CD', "DR Congo", '243'],
  ['AO', "Angola", '244'],
  ['NA', "Namibia", '264'],
  ['BW', "Botswana", '267'],
  ['ZW', "Zimbabwe", '263'],
  ['ZM', "Zambia", '260'],
  ['MW', "Malawi", '265'],
  ['MZ', "Mozambique", '258'],
  ['TZ', "Tanzania", '255'],
  ['UG', "Uganda", '256'],
  ['RW', "Rwanda", '250'],
  ['BI', "Burundi", '257'],
  ['ET', "Ethiopia", '251'],
  ['SO', "Somalia", '252'],
  ['SD', "Sudan", '249'],
  ['SS', "South Sudan", '211'],
  ['EG', "Egypt", '20'],
  ['LY', "Libya", '218'],
  ['TN', "Tunisia", '216'],
  ['DZ', "Algeria", '213'],
  ['MA', "Morocco", '212'],
  ['MU', "Mauritius", '230'],
  ['MG', "Madagascar", '261'],
  ['GB', "United Kingdom", '44'],
  ['IE', "Ireland", '353'],
  ['US', "United States", '1'],
  ['CA', "Canada", '1'],
  ['JM', "Jamaica", '1876'],
  ['TT', "Trinidad and Tobago", '1868'],
  ['BB', "Barbados", '1246'],
  ['BS', "Bahamas", '1242'],
  ['MX', "Mexico", '52'],
  ['BR', "Brazil", '55'],
  ['AR', "Argentina", '54'],
  ['CO', "Colombia", '57'],
  ['CL', "Chile", '56'],
  ['PE', "Peru", '51'],
  ['VE', "Venezuela", '58'],
  ['DE', "Germany", '49'],
  ['FR', "France", '33'],
  ['ES', "Spain", '34'],
  ['PT', "Portugal", '351'],
  ['IT', "Italy", '39'],
  ['NL', "Netherlands", '31'],
  ['BE', "Belgium", '32'],
  ['CH', "Switzerland", '41'],
  ['AT', "Austria", '43'],
  ['SE', "Sweden", '46'],
  ['NO', "Norway", '47'],
  ['DK', "Denmark", '45'],
  ['FI', "Finland", '358'],
  ['PL', "Poland", '48'],
  ['CZ', "Czechia", '420'],
  ['GR', "Greece", '30'],
  ['RO', "Romania", '40'],
  ['HU', "Hungary", '36'],
  ['UA', "Ukraine", '380'],
  ['RU', "Russia", '7'],
  ['TR', "Turkey", '90'],
  ['IL', "Israel", '972'],
  ['SA', "Saudi Arabia", '966'],
  ['AE', "United Arab Emirates", '971'],
  ['QA', "Qatar", '974'],
  ['KW', "Kuwait", '965'],
  ['OM', "Oman", '968'],
  ['BH', "Bahrain", '973'],
  ['JO', "Jordan", '962'],
  ['LB', "Lebanon", '961'],
  ['IQ', "Iraq", '964'],
  ['IR', "Iran", '98'],
  ['PK', "Pakistan", '92'],
  ['IN', "India", '91'],
  ['BD', "Bangladesh", '880'],
  ['LK', "Sri Lanka", '94'],
  ['NP', "Nepal", '977'],
  ['CN', "China", '86'],
  ['HK', "Hong Kong", '852'],
  ['TW', "Taiwan", '886'],
  ['JP', "Japan", '81'],
  ['KR', "South Korea", '82'],
  ['PH', "Philippines", '63'],
  ['ID', "Indonesia", '62'],
  ['MY', "Malaysia", '60'],
  ['SG', "Singapore", '65'],
  ['TH', "Thailand", '66'],
  ['VN', "Vietnam", '84'],
  ['AU', "Australia", '61'],
  ['NZ', "New Zealand", '64'],
]

export const COUNTRIES: Country[] = RAW.map(([iso, name, dial]) => ({ iso, name, dial }))

export const flag = (iso: string) =>
  String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))

/** Nigeria unless the phone's language says it is somewhere else we know. */
export function guessCountry(): Country {
  const region = (typeof navigator !== 'undefined' ? navigator.language : '').split('-')[1]?.toUpperCase()
  return COUNTRIES.find((c) => c.iso === region) ?? COUNTRIES[0]
}

/**
 * Turns what the person typed into +<country><number>, or null when it cannot be a real mobile number.
 * Accepts the local form (0803 123 4567), the plain form, or the full international form (+234 803 123 4567).
 */
export function normalizePhone(country: Country, input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) {
    digits = digits.slice(1)
    if (digits.startsWith(country.dial)) digits = digits.slice(country.dial.length)
    else {
      // typed with another country's code: accept it as it is
      return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
    }
  } else if (digits.startsWith('00')) {
    return /^[1-9]\d{7,14}$/.test(digits.slice(2)) ? `+${digits.slice(2)}` : null
  } else if (digits.startsWith(country.dial) && digits.length > country.dial.length + 7 && country.iso !== 'US' && country.iso !== 'CA') {
    digits = digits.slice(country.dial.length)
  }
  if (digits.startsWith('0')) digits = digits.slice(1) // local trunk zero
  if (country.iso === 'NG') return /^[789][01]\d{8}$/.test(digits) ? `+234${digits}` : null
  if (!/^\d{6,13}$/.test(digits) || (country.dial + digits).length > 15) return null
  return `+${country.dial}${digits}`
}

/** The country of a saved +number, found from its dialling code (longest match wins). */
export function countryOfNumber(num: string): Country {
  const d = num.replace(/^\+/, '')
  return [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => d.startsWith(c.dial)) ?? COUNTRIES[0]
}

/** A number out of someone's address book, turned into +<country><number> using my own country for local numbers. */
export function contactNumber(raw: string, mine: Country): string | null {
  let d = raw.replace(/[^\d+]/g, '')
  if (!d) return null
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = mine.dial + d.slice(1)
  else if (!(d.startsWith(mine.dial) && d.length >= mine.dial.length + 8)) d = mine.dial + d
  return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null
}

/** Phone numbers found in a vCard (.vcf) contacts file. */
export function numbersFromVcf(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (/^(item\d+\.)?TEL[;:]/i.test(line)) out.push(line.slice(line.indexOf(':') + 1).trim())
  }
  return out
}
