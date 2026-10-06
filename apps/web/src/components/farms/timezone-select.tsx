"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ZoneOption = { zone: string; city: string };
type CountryGroup = { country: string; zones: ZoneOption[] };

const NONE = "__none__";

export const TIMEZONE_GROUPS: CountryGroup[] = [
  { country: "Türkiye", zones: [{ zone: "Europe/Istanbul", city: "İstanbul" }] },
  { country: "Kıbrıs", zones: [{ zone: "Asia/Nicosia", city: "Lefkoşa" }] },
  { country: "Yunanistan", zones: [{ zone: "Europe/Athens", city: "Atina" }] },
  { country: "İtalya", zones: [{ zone: "Europe/Rome", city: "Roma" }] },
  { country: "İspanya", zones: [{ zone: "Europe/Madrid", city: "Madrid" }] },
  { country: "Portekiz", zones: [{ zone: "Europe/Lisbon", city: "Lizbon" }] },
  { country: "Fransa", zones: [{ zone: "Europe/Paris", city: "Paris" }] },
  { country: "Almanya", zones: [{ zone: "Europe/Berlin", city: "Berlin" }] },
  { country: "Hollanda", zones: [{ zone: "Europe/Amsterdam", city: "Amsterdam" }] },
  { country: "Norveç", zones: [{ zone: "Europe/Oslo", city: "Oslo" }] },
  { country: "İsveç", zones: [{ zone: "Europe/Stockholm", city: "Stockholm" }] },
  { country: "Finlandiya", zones: [{ zone: "Europe/Helsinki", city: "Helsinki" }] },
  { country: "Birleşik Krallık", zones: [{ zone: "Europe/London", city: "Londra" }] },
  { country: "İrlanda", zones: [{ zone: "Europe/Dublin", city: "Dublin" }] },
  { country: "Polonya", zones: [{ zone: "Europe/Warsaw", city: "Varşova" }] },
  { country: "Romanya", zones: [{ zone: "Europe/Bucharest", city: "Bükreş" }] },
  { country: "Ukrayna", zones: [{ zone: "Europe/Kyiv", city: "Kiev" }] },
  { country: "Rusya", zones: [{ zone: "Europe/Moscow", city: "Moskova" }] },
  { country: "Mısır", zones: [{ zone: "Africa/Cairo", city: "Kahire" }] },
  { country: "Fas", zones: [{ zone: "Africa/Casablanca", city: "Kazablanka" }] },
  { country: "Cezayir", zones: [{ zone: "Africa/Algiers", city: "Cezayir" }] },
  { country: "Güney Afrika", zones: [{ zone: "Africa/Johannesburg", city: "Johannesburg" }] },
  { country: "Nijerya", zones: [{ zone: "Africa/Lagos", city: "Lagos" }] },
  { country: "Kenya", zones: [{ zone: "Africa/Nairobi", city: "Nairobi" }] },
  { country: "Birleşik Arap Emirlikleri", zones: [{ zone: "Asia/Dubai", city: "Dubai" }] },
  { country: "Suudi Arabistan", zones: [{ zone: "Asia/Riyadh", city: "Riyad" }] },
  { country: "İran", zones: [{ zone: "Asia/Tehran", city: "Tahran" }] },
  { country: "Pakistan", zones: [{ zone: "Asia/Karachi", city: "Karaçi" }] },
  { country: "Hindistan", zones: [{ zone: "Asia/Kolkata", city: "Kalküta" }] },
  { country: "Bangladeş", zones: [{ zone: "Asia/Dhaka", city: "Dakka" }] },
  { country: "Tayland", zones: [{ zone: "Asia/Bangkok", city: "Bangkok" }] },
  { country: "Vietnam", zones: [{ zone: "Asia/Ho_Chi_Minh", city: "Ho Chi Minh" }] },
  { country: "Endonezya", zones: [{ zone: "Asia/Jakarta", city: "Cakarta" }] },
  { country: "Filipinler", zones: [{ zone: "Asia/Manila", city: "Manila" }] },
  { country: "Çin", zones: [{ zone: "Asia/Shanghai", city: "Şanghay" }] },
  { country: "Hong Kong", zones: [{ zone: "Asia/Hong_Kong", city: "Hong Kong" }] },
  { country: "Tayvan", zones: [{ zone: "Asia/Taipei", city: "Taipei" }] },
  { country: "Japonya", zones: [{ zone: "Asia/Tokyo", city: "Tokyo" }] },
  { country: "Güney Kore", zones: [{ zone: "Asia/Seoul", city: "Seul" }] },
  {
    country: "Avustralya",
    zones: [
      { zone: "Australia/Sydney", city: "Sidney" },
      { zone: "Australia/Perth", city: "Perth" },
    ],
  },
  { country: "Yeni Zelanda", zones: [{ zone: "Pacific/Auckland", city: "Auckland" }] },
  {
    country: "ABD",
    zones: [
      { zone: "America/New_York", city: "New York" },
      { zone: "America/Chicago", city: "Chicago" },
      { zone: "America/Denver", city: "Denver" },
      { zone: "America/Los_Angeles", city: "Los Angeles" },
    ],
  },
  {
    country: "Kanada",
    zones: [
      { zone: "America/Toronto", city: "Toronto" },
      { zone: "America/Vancouver", city: "Vancouver" },
    ],
  },
  { country: "Meksika", zones: [{ zone: "America/Mexico_City", city: "Meksika" }] },
  { country: "Kolombiya", zones: [{ zone: "America/Bogota", city: "Bogota" }] },
  { country: "Ekvador", zones: [{ zone: "America/Guayaquil", city: "Guayaquil" }] },
  { country: "Peru", zones: [{ zone: "America/Lima", city: "Lima" }] },
  { country: "Şili", zones: [{ zone: "America/Santiago", city: "Santiago" }] },
  { country: "Arjantin", zones: [{ zone: "America/Argentina/Buenos_Aires", city: "Buenos Aires" }] },
  { country: "Brezilya", zones: [{ zone: "America/Sao_Paulo", city: "São Paulo" }] },
];

const ALL_ZONES = TIMEZONE_GROUPS.flatMap((g) =>
  g.zones.map((z) => ({ ...z, country: g.country })),
);

function labelFor(zone: string): string | undefined {
  const match = ALL_ZONES.find((z) => z.zone === zone);
  return match ? `${match.country} — ${match.city}` : undefined;
}

export function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const knownZone = value !== "" && ALL_ZONES.some((z) => z.zone === value);
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Seçin">
          {(v: string) => {
            if (v === NONE) return "Seçilmedi";
            return labelFor(v) ?? `${v} (mevcut)`;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>Seçilmedi</SelectItem>
        {!knownZone && value !== "" ? (
          <SelectItem value={value}>{value} (mevcut)</SelectItem>
        ) : null}
        {TIMEZONE_GROUPS.map((group) => (
          <SelectGroup key={group.country}>
            <SelectLabel>{group.country}</SelectLabel>
            {group.zones.map((z) => (
              <SelectItem key={z.zone} value={z.zone}>
                {group.country} — {z.city}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
