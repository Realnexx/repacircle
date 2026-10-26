import { useQuery } from '@tanstack/react-query'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { FormField } from '@/components/forms/controls'
import type { ProfileInput } from './service'
import { getLocations } from './psgc'
import type { Location } from './psgc'

export function PersonalFields({ form }: { form: UseFormReturn<ProfileInput> }) {
  const [region, province, city] = useWatch({
    control: form.control,
    name: ['region_code', 'province_code', 'city_code'],
  })
  const regions = useQuery({
    queryKey: ['psgc', 'regions'],
    queryFn: ({ signal }) => getLocations('regions', signal),
    staleTime: 86_400_000,
  })
  const provinces = useQuery({
    queryKey: ['psgc', 'provinces', region],
    enabled: Boolean(region),
    queryFn: ({ signal }) => getLocations(`regions/${region}/provinces`, signal),
    staleTime: 86_400_000,
  })
  const cities = useQuery({
    queryKey: ['psgc', 'cities', region, province],
    enabled: Boolean(region && provinces.isSuccess && (province || provinces.data.length === 0)),
    queryFn: ({ signal }) =>
      getLocations(
        province
          ? `provinces/${province}/cities-municipalities`
          : `regions/${region}/cities-municipalities`,
        signal,
      ),
    staleTime: 86_400_000,
  })
  const barangays = useQuery({
    queryKey: ['psgc', 'barangays', city],
    enabled: Boolean(city),
    queryFn: ({ signal }) => getLocations(`cities-municipalities/${city}/barangays`, signal),
    staleTime: 86_400_000,
  })
  const clear = (fields: ('province' | 'city' | 'barangay')[]) =>
    fields.forEach((field) => {
      form.setValue(`${field}_code`, '', { shouldDirty: true })
      form.setValue(`${field}_name`, '', { shouldDirty: true })
    })
  const select = (
    field: 'region' | 'province' | 'city' | 'barangay',
    items: Location[],
    value: string,
  ) => {
    form.setValue(`${field}_code`, value, { shouldDirty: true, shouldValidate: true })
    form.setValue(`${field}_name`, items.find((item) => item.code === value)?.name ?? '', {
      shouldDirty: true,
    })
    if (field === 'region') clear(['province', 'city', 'barangay'])
    if (field === 'province') clear(['city', 'barangay'])
    if (field === 'city') clear(['barangay'])
  }
  return (
    <>
      <fieldset className="component-spacing">
        <legend>Personal information</legend>
        <div className="personal-fields">
          {(
            [
              ['first_name', 'First name', 'given-name', 50],
              ['middle_name', 'Middle name (optional)', 'additional-name', 50],
              ['last_name', 'Last name', 'family-name', 50],
              [
                'extension_name',
                'Extension name (optional, e.g. Jr., III)',
                'honorific-suffix',
                10,
              ],
            ] as const
          ).map(([field, label, autoComplete, maxLength]) => (
            <FormField
              key={field}
              id={field}
              label={label}
              error={form.formState.errors[field]?.message}
            >
              <input
                id={field}
                autoComplete={autoComplete}
                maxLength={maxLength}
                {...form.register(field)}
                aria-invalid={Boolean(form.formState.errors[field])}
                aria-describedby={form.formState.errors[field] ? `${field}-error` : undefined}
              />
            </FormField>
          ))}
          <FormField id="gender" label="Gender" error={form.formState.errors.gender?.message}>
            <select id="gender" {...form.register('gender')}>
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="self_described">Self-described / another gender</option>
            </select>
          </FormField>
        </div>
      </fieldset>
      <fieldset className="component-spacing">
        <legend>Philippine address</legend>
        <p className="field-hint">
          Select your PSGC address, then add your house/building and street or purok. Middle and
          extension names are optional.
        </p>
        <div className="personal-fields">
          {(
            [
              ['region', 'Region', regions, false],
              [
                'province',
                'Province',
                provinces,
                !region || (provinces.isSuccess && provinces.data.length === 0),
              ],
              [
                'city',
                'City / municipality',
                cities,
                !region || !provinces.isSuccess || (provinces.data.length > 0 && !province),
              ],
              ['barangay', 'Barangay', barangays, !city],
            ] as const
          ).map(([field, label, query, disabled]) => (
            <FormField
              key={field}
              id={`${field}_code`}
              label={label}
              error={form.formState.errors[`${field}_code`]?.message}
            >
              <select
                id={`${field}_code`}
                value={form.watch(`${field}_code`)}
                disabled={disabled || query.isFetching || query.isError}
                onChange={(event) => select(field, query.data ?? [], event.target.value)}
                aria-invalid={Boolean(form.formState.errors[`${field}_code`])}
                aria-describedby={
                  form.formState.errors[`${field}_code`] ? `${field}_code-error` : undefined
                }
              >
                <option value="">
                  {field === 'province' && provinces.isSuccess && provinces.data.length === 0
                    ? 'Not applicable'
                    : query.isFetching
                      ? 'Loading…'
                      : `Select ${label.toLowerCase()}`}
                </option>
                {query.data?.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              {query.isError && (
                <p role="alert">
                  Unable to load {label.toLowerCase()}.{' '}
                  <button type="button" onClick={() => void query.refetch()}>
                    Retry
                  </button>
                </p>
              )}
            </FormField>
          ))}
        </div>
        <FormField
          id="street_address"
          label="House / building, street / purok"
          error={form.formState.errors.street_address?.message}
        >
          <input
            id="street_address"
            autoComplete="street-address"
            maxLength={150}
            {...form.register('street_address')}
            aria-invalid={Boolean(form.formState.errors.street_address)}
            aria-describedby={
              form.formState.errors.street_address ? 'street_address-error' : undefined
            }
          />
        </FormField>
        <FormField
          id="postal_code"
          label="Postal code (optional)"
          error={form.formState.errors.postal_code?.message}
        >
          <input
            id="postal_code"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={4}
            {...form.register('postal_code')}
            aria-invalid={Boolean(form.formState.errors.postal_code)}
            aria-describedby={form.formState.errors.postal_code ? 'postal_code-error' : undefined}
          />
        </FormField>
      </fieldset>
    </>
  )
}
