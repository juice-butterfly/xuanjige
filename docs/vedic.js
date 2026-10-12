/* =====================================================================
 * 玄机阁 · 印占（吠陀占星）引擎 —— 浏览器端实现
 *
 * 口径与后端 vedic/engine.py 严格对齐：
 *   · 恒星黄道模式  SIDM_TRUE_CITRA (27)
 *   · 行星位置 flags = SWIEPH|SIDEREAL|SPEED|TRUEPOS|NONUT|NOGDEFL = 66386
 *   · 上升点   houses_ex(jd, FLG_SIDEREAL, lat, lon, 'W')  → ascmc[0]
 *   · 整宫制   第 N 宫 = (行星星座序号 - 升座星座序号) mod 12 + 1
 *   · 罗睺 = 平均交点(MEAN_NODE)，计都 = 罗睺 + 180°
 *   · 27 纳沙特拉 13°20' 一段，pada = 每 3°20' 一段
 *   · Vimshottari 大运：由月亮所在宿起运，年长取"真恒星年"
 *
 * 天文核心用瑞士星历的 WASM 编译产物（与后端 pysweph 同源）。
 * ===================================================================== */

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
               'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const SIGNS_CN = ['白羊','金牛','双子','巨蟹','狮子','处女',
                  '天秤','天蝎','射手','摩羯','水瓶','双鱼'];

const PLANETS_CN = { Sun:'太阳', Moon:'月亮', Mars:'火星', Mercury:'水星',
                     Jupiter:'木星', Venus:'金星', Saturn:'土星', Rahu:'罗睺', Ketu:'计都' };

const NAKSHATRAS = [
  ['Ashwini','Ketu'], ['Bharani','Venus'], ['Krittika','Sun'],
  ['Rohini','Moon'], ['Mrigashira','Mars'], ['Ardra','Rahu'],
  ['Punarvasu','Jupiter'], ['Pushya','Saturn'], ['Ashlesha','Mercury'],
  ['Magha','Ketu'], ['Purva Phalguni','Venus'], ['Uttara Phalguni','Sun'],
  ['Hasta','Moon'], ['Chitra','Mars'], ['Swati','Rahu'],
  ['Vishakha','Jupiter'], ['Anuradha','Saturn'], ['Jyeshtha','Mercury'],
  ['Moola','Ketu'], ['Purva Ashadha','Venus'], ['Uttara Ashadha','Sun'],
  ['Shravana','Moon'], ['Dhanishta','Mars'], ['Shatabhisha','Rahu'],
  ['Purva Bhadrapada','Jupiter'], ['Uttara Bhadrapada','Saturn'], ['Revati','Mercury']
];
const NAK_CN = ['阿湿尼','婆罗尼','觜宿','罗希尼','觜月','阿德拉','婆罗婆苏','布沙','阿舍沙',
                '摩伽','前颇勒窭尼','后颇勒窭尼','手宿','角宿','娑婆底',
                '毗沙迦','阿奴罗陀','哲士他','根宿','前阿沙陀','后阿沙陀',
                '室罗伐那','檀尼什他','沙特毗沙','前婆陀罗','后婆陀罗','利物帝'];

const SIGN_LORDS = ['Mars','Venus','Mercury','Moon','Sun','Mercury',
                    'Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
const LORD_CN = { Sun:'太阳', Moon:'月亮', Mars:'火星', Mercury:'水星',
                  Jupiter:'木星', Venus:'金星', Saturn:'土星', Rahu:'罗睺', Ketu:'计都' };

const DASHA_ORDER = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
const DASHA_YEARS = { Ketu:7, Venus:20, Sun:6, Moon:10, Mars:7, Rahu:18, Jupiter:16, Saturn:19, Mercury:17 };

const HOUSE_DOMAINS = { 1:'自我', 2:'财富', 3:'兄弟', 4:'家庭', 5:'子女',
                        6:'疾病', 7:'婚姻', 8:'变故', 9:'运势', 10:'事业',
                        11:'收入', 12:'损耗' };

/* 庙旺 / 落陷 / 入庙（BPHS） */
const EXALTATION   = { Sun:'Aries', Moon:'Taurus', Mars:'Capricorn', Mercury:'Virgo',
                       Jupiter:'Cancer', Venus:'Pisces', Saturn:'Libra' };
const DEBILITATION = { Sun:'Libra', Moon:'Scorpio', Mars:'Cancer', Mercury:'Pisces',
                       Jupiter:'Capricorn', Venus:'Virgo', Saturn:'Aries' };
const OWN_SIGNS    = { Sun:['Leo'], Moon:['Cancer'], Mars:['Aries','Scorpio'],
                       Mercury:['Gemini','Virgo'], Jupiter:['Sagittarius','Pisces'],
                       Venus:['Taurus','Libra'], Saturn:['Capricorn','Aquarius'] };
const MOOLA        = { Sun:'Leo', Moon:'Taurus', Mars:'Aries', Mercury:'Virgo',
                       Jupiter:'Sagittarius', Venus:'Libra', Saturn:'Aquarius' };

/* 中国夏令时（1986–1991，北京时间 02:00 拨快 1 小时）*/
const CN_DST = [
  ['1986-05-04','1986-09-14'], ['1987-04-12','1987-09-13'],
  ['1988-04-10','1988-09-11'], ['1989-04-16','1989-09-17'],
  ['1990-04-15','1990-09-16'], ['1991-04-14','1991-09-15']
];

/* ---------- 格式化：星座内度数 → D°MM'（含进位收敛，与后端 _deg_min 一致）---------- */
export function degMin(degree) {
  let d = Math.floor(degree);
  let m = Math.round((degree - d) * 60);
  if (m === 60) { if (d >= 29) { m = 59; } else { d += 1; m = 0; } }
  return `${d}°${String(m).padStart(2, '0')}'`;
}

/* ---------- 儒略日 ↔ 公历（纯 JS，避免额外依赖）---------- */
export function dateToJd(y, mo, d, hourFrac) {
  let Y = y, M = mo;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 + hourFrac / 24;
}
export function jdToDate(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) { const al = Math.floor((z - 1867216.25) / 36524.25); a = z + 1 + al - Math.floor(al / 4); }
  const b = a + 1524, c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c), e = Math.floor((b - d) / 30.6001);
  const dayF = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  const day = Math.floor(dayF);
  const hours = (dayF - day) * 24;
  return { year, month, day, hours };
}
const pad2 = n => String(n).padStart(2, '0');
export function jdToYmd(jd) {
  const t = jdToDate(jd);
  return `${t.year}-${pad2(t.month)}-${pad2(t.day)}`;
}
export function jdToYm(jd) {
  const t = jdToDate(jd);
  return `${t.year}-${pad2(t.month)}`;
}

/* 中国时区：Asia/Shanghai = UTC+8，1986–1991 夏令时期间 +9 */
export function cnUtcOffset(y, mo, d) {
  const key = `${y}-${pad2(mo)}-${pad2(d)}`;
  for (const [s, e] of CN_DST) if (key >= s && key <= e) return 9;
  return 8;
}

/* =====================================================================
 *  引擎初始化（懒加载：只有用户打开印占时才拉 2.8MB 的 WASM）
 * ===================================================================== */
const PLANET_FLAGS = 2 | 65536 | 256 | 16 | 64 | 512;   // = 66386
const SE = { SUN:0, MOON:1, MERCURY:2, VENUS:3, MARS:4, JUPITER:5, SATURN:6, MEAN_NODE:10 };

let swe = null;
let initPromise = null;

export function ensureVedic() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = await import('./swisseph-wasm/src/swisseph.js');
    const SwissEph = mod.default;
    swe = new SwissEph();
    await swe.initSwissEph();
    swe.set_sid_mode(27 /* SE_SIDM_TRUE_CITRA */, 0, 0);
    return true;
  })();
  return initPromise;
}

const calcLon = (jd, body) => Number(swe.calc_ut(jd, body, PLANET_FLAGS)[0]);
const calcSpeed = (jd, body) => Number(swe.calc_ut(jd, body, PLANET_FLAGS)[3]);

function nakOf(lon) {
  const span = 360 / 27;
  const idx = Math.floor(lon / span);
  const pada = Math.floor((lon % span) / (360 / 108)) + 1;
  const [name, lord] = NAKSHATRAS[idx] || ['', ''];
  return { idx, name, name_cn: NAK_CN[idx] || name, pada, lord, lord_cn: LORD_CN[lord] || lord };
}
const signOf = lon => ((Math.floor(lon / 30) % 12) + 12) % 12;
const houseOf = (signIdx, lagnaIdx) => ((signIdx - lagnaIdx) % 12 + 12) % 12 + 1;

/* 真恒星年：太阳两次进入白羊座（恒星黄道 0°）的间隔 —— 与后端 true_sidereal_year 同义 */
function sunSidLon(jd) { return calcLon(jd, SE.SUN); }
function ariesIngress(jd, dir) {
  // 求使太阳恒星黄经 = 0 的儒略日（dir=+1 向后找，dir=-1 向前找）
  const lon = sunSidLon(jd);
  let guess = dir > 0 ? jd + ((360 - lon) % 360) / 0.9856 : jd - lon / 0.9856;
  let lo = guess - 6, hi = guess + 6;
  const f = x => {                            // 归一到 (-180,180]，过零点变号
    let v = sunSidLon(x);
    if (v > 180) v -= 360;
    return v;
  };
  for (let i = 0; i < 80; i++) {              // 二分收敛
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function trueSiderealYear(jd) {
  try {
    const prev = ariesIngress(jd, -1);
    const next = ariesIngress(jd, +1);
    const yd = next - prev;
    return (yd > 360 && yd < 372) ? yd : 365.256364;
  } catch (e) { return 365.256364; }
}

/* =====================================================================
 *  Vimshottari 大运
 * ===================================================================== */
export function vimshottari(moonLon, jdBirth, yearDays) {
  const span = 360 / 27;
  const nak = Math.floor(moonLon / span);
  const rem = moonLon - nak * span;
  const lord = DASHA_ORDER[nak % 9];          // 与 PyJHora vimsottari_adhipati(nak) 同式
  const period = DASHA_YEARS[lord];
  const elapsedYears = (rem / span) * period;

  const mds = [];
  let cursor = jdBirth - elapsedYears * yearDays;
  let first = true;
  for (let i = 0; i < 9; i++) {
    // 首运从出生宿的主星开始；其后按 DASHA_ORDER 顺延
    const idx = (DASHA_ORDER.indexOf(lord) + i) % 9;
    const mdLord = DASHA_ORDER[idx];
    const years = DASHA_YEARS[mdLord];
    // 首运只从起点到出生后的余段，完整运期仍按整年换算（与后端一致：start 回推）
    const startJd = cursor;
    const endJd = cursor + years * yearDays;

    // 次运（Antardasha）：自该运主星起按顺序排，时长 = 大运年 × 次运年 / 120
    const ads = [];
    let adCur = startJd;
    for (let k = 0; k < 9; k++) {
      const adLord = DASHA_ORDER[(DASHA_ORDER.indexOf(mdLord) + k) % 9];
      const adYears = (years * DASHA_YEARS[adLord]) / 120;
      const adEnd = adCur + adYears * yearDays;
      ads.push({ lord: adLord, lord_cn: LORD_CN[adLord], start: adCur, end: adEnd, years: adYears });
      adCur = adEnd;
    }

    mds.push({ lord: mdLord, lord_cn: LORD_CN[mdLord], start: startJd, end: endJd, years, ads });
    cursor = endJd;
    first = false;
  }
  // 输出窗口：从出生那一年起足够覆盖一生
  return { nakIdx: nak, lord, lord_cn: LORD_CN[lord], period, elapsedYears, list: mds, yearDays };
}

/* =====================================================================
 *  主入口
 * ===================================================================== */
export async function calcVedic(input) {
  await ensureVedic();
  const { year, month, day, hour, minute, lat, lon, place } = input;

  const tz = input.tzOffset != null ? input.tzOffset : cnUtcOffset(year, month, day);
  const localHour = hour + minute / 60;
  const jdUt = dateToJd(year, month, day, localHour - tz);

  const ayanamsa = swe.get_ayanamsa(jdUt);

  /* 升座 */
  const h = swe.houses_ex(jdUt, 65536 /* FLG_SIDEREAL */, lat, lon, 'W');
  const ascLon = h.ascmc[0];
  const lagnaSignIdx = signOf(ascLon);
  const lagna = {
    longitude: ascLon, sign: SIGNS[lagnaSignIdx], sign_cn: SIGNS_CN[lagnaSignIdx],
    degree: ascLon % 30, deg_str: degMin(ascLon % 30),
    nakshatra: nakOf(ascLon), house: 1
  };

  /* 七政 + 罗计 */
  const planets = {};
  const seven = [['Sun',SE.SUN],['Moon',SE.MOON],['Mars',SE.MARS],['Mercury',SE.MERCURY],
                 ['Jupiter',SE.JUPITER],['Venus',SE.VENUS],['Saturn',SE.SATURN]];
  for (const [name, id] of seven) {
    const lonP = calcLon(jdUt, id);
    const spd = calcSpeed(jdUt, id);
    const si = signOf(lonP);
    planets[name] = {
      planet: name, planet_cn: PLANETS_CN[name],
      longitude: lonP, sign: SIGNS[si], sign_cn: SIGNS_CN[si], sign_idx: si,
      degree: lonP % 30, deg_str: degMin(lonP % 30),
      retrograde: spd < 0, speed: spd,
      house: houseOf(si, lagnaSignIdx), nakshatra: nakOf(lonP)
    };
  }
  {
    const rahuLon = calcLon(jdUt, SE.MEAN_NODE);
    const rahuSpd = calcSpeed(jdUt, SE.MEAN_NODE);
    const rs = signOf(rahuLon);
    planets.Rahu = {
      planet:'Rahu', planet_cn:'罗睺', longitude: rahuLon,
      sign: SIGNS[rs], sign_cn: SIGNS_CN[rs], sign_idx: rs,
      degree: rahuLon % 30, deg_str: degMin(rahuLon % 30),
      retrograde: true, speed: rahuSpd,
      house: houseOf(rs, lagnaSignIdx), nakshatra: nakOf(rahuLon)
    };
    const ketuLon = (rahuLon + 180) % 360;
    const ks = signOf(ketuLon);
    planets.Ketu = {
      planet:'Ketu', planet_cn:'计都', longitude: ketuLon,
      sign: SIGNS[ks], sign_cn: SIGNS_CN[ks], sign_idx: ks,
      degree: ketuLon % 30, deg_str: degMin(ketuLon % 30),
      retrograde: true, speed: -rahuSpd,
      house: houseOf(ks, lagnaSignIdx), nakshatra: nakOf(ketuLon)
    };
  }

  /* 庙旺陷 */
  const ORDER9 = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];
  for (const n of ORDER9) {
    const p = planets[n];
    if (!p) continue;
    const s = p.sign;
    if (EXALTATION[n] === s) p.dignity = '入旺';
    else if (DEBILITATION[n] === s) p.dignity = '落陷';
    else if (MOOLA[n] === s) p.dignity = '入庙';
    else if ((OWN_SIGNS[n] || []).includes(s)) p.dignity = '本宫';
    else p.dignity = '';
  }

  /* 十二宫（整宫制）*/
  const houses = [];
  for (let hh = 1; hh <= 12; hh++) {
    const si = (lagnaSignIdx + hh - 1) % 12;
    houses.push({
      house: hh, sign: SIGNS[si], sign_cn: SIGNS_CN[si],
      lord: SIGN_LORDS[si], lord_cn: LORD_CN[SIGN_LORDS[si]],
      domain: HOUSE_DOMAINS[hh],
      occupants: ORDER9.filter(n => planets[n] && planets[n].sign_idx === si)
    });
  }

  /* 纳沙特拉九曜（Vimshottari 大运用）*/
  const nakLord = LORD_CN[NAKSHATRAS[nakOf(planets.Moon.longitude).idx][1]];

  /* 大运 */
  const yearDays = trueSiderealYear(jdUt);
  const dasha = vimshottari(planets.Moon.longitude, jdUt, yearDays);

  /* 月相 */
  const diff = ((planets.Moon.longitude - planets.Sun.longitude) % 360 + 360) % 360;
  const moonPhase = diff < 180 ? 'waxing' : 'waning';
  const tithi = Math.floor(diff / 12) + 1;

  /* 罗睺/计都所在宿主星（大运顺序参考）*/

  return {
    input: { year, month, day, hour, minute, lat, lon, place: place || '', tzOffset: tz },
    jdUt, ayanamsa,
    lagna, planets, houses,
    moonNakshatra: Object.assign({}, nakOf(planets.Moon.longitude)),
    moonPhase, tithi, waxing: moonPhase === 'waxing',
    dasha, yearDays,
    engine: { sidMode: 'TRUE_CITRA(27)', flags: PLANET_FLAGS, ephemeris: 'swisseph-wasm' }
  };
}

/* 供 Node 端校验使用 */
export function __internal() { return { swe, trueSiderealYear, dateToJd, jdToDate }; }

/* 常量表导出（供页面渲染层复用，避免重复维护一份） */
export {
  SIGNS, SIGNS_CN, PLANETS_CN, NAKSHATRAS, NAK_CN,
  SIGN_LORDS, LORD_CN, DASHA_ORDER, DASHA_YEARS, HOUSE_DOMAINS,
  EXALTATION, DEBILITATION, OWN_SIGNS, MOOLA,
};
