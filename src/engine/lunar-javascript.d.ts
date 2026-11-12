declare module 'lunar-javascript' {
  export class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar
    static fromYmd(year: number, month: number, day: number): Solar
    getLunar(): Lunar
  }

  export class Lunar {
    getEightChar(): EightChar
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getYearShengXiao(): string
    getYearInGanZhi(): string
  }

  export class EightChar {
    setSect(sect: number): void
    getSect(): number
    getYear(): string
    getMonth(): string
    getDay(): string
    getTime(): string
    getYearNaYin(): string
    getMonthNaYin(): string
    getDayNaYin(): string
    getTimeNaYin(): string
    getYearXunKong(): string
    getMonthXunKong(): string
    getDayXunKong(): string
    getTimeXunKong(): string
    getYearDiShi(): string
    getMonthDiShi(): string
    getDayDiShi(): string
    getTimeDiShi(): string
    getMingGong(): string
    getShenGong(): string
    getTaiYuan(): string
    getTaiXi(): string
    getYun(gender: number, sect?: number): Yun
  }

  export class Yun {
    getDaYun(n?: number): DaYun[]
  }

  export class DaYun {
    getGanZhi(): string
    getStartAge(): number
    getEndAge(): number
    getStartYear(): number
    getEndYear(): number
  }
}
