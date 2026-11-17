import { coordsLabel } from '../lib/format'
import citiesRaw from '../data/cities.json'

type Coord = { lat: number; lon: number }

const CITIES = (citiesRaw as unknown as { data: Record<string, Record<string, Coord>> }).data
const PROVINCES = Object.keys(CITIES)

export type PlaceValue = {
  province: string
  city: string
  lat: number | null
  lon: number | null
}

export function PlaceFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: PlaceValue
  onChange: (patch: Partial<PlaceValue>) => void
}) {
  function chooseProvince(province: string) {
    onChange({ province, city: '', lat: null, lon: null })
  }

  function chooseCity(city: string) {
    const coord = value.province ? CITIES[value.province]?.[city] : null
    onChange({ city, lat: coord ? coord.lat : null, lon: coord ? coord.lon : null })
  }

  return (
    <>
      <div className="ledger-row">
        <div className="row-main">
          <label className="row-label" htmlFor={`${idPrefix}-province`}>
            出生省份
          </label>
          <span className="leader" aria-hidden="true" />
          <span className="control control--select">
            <select
              id={`${idPrefix}-province`}
              value={value.province}
              className={value.province ? '' : 'is-empty'}
              onChange={(e) => chooseProvince(e.target.value)}
            >
              <option value="">未择</option>
              {PROVINCES.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      <div className="ledger-row">
        <div className="row-main">
          <label className="row-label" htmlFor={`${idPrefix}-city`}>
            出生城市
          </label>
          <span className="leader" aria-hidden="true" />
          <span className="control control--select">
            <select
              id={`${idPrefix}-city`}
              value={value.city}
              disabled={!value.province}
              className={value.city ? '' : 'is-empty'}
              onChange={(e) => chooseCity(e.target.value)}
            >
              <option value="">{value.province ? '未择' : '先择省份'}</option>
              {value.province &&
                Object.keys(CITIES[value.province]).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
            </select>
          </span>
        </div>
        <p className={`coords${value.lat !== null && value.lon !== null ? '' : ' is-empty'}`}>
          {value.lat !== null && value.lon !== null
            ? coordsLabel(value.lat, value.lon)
            : '择地而后定经纬'}
        </p>
      </div>
    </>
  )
}
