import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PersonalFields } from './personal-fields'
import { emptyPersonal } from './personal'
import { pendingInvitationPath } from '@/modules/auth/invitation-intent'
import { useSession } from '@/modules/auth/session'
import { changeEmail } from '@/modules/auth/service'
import { emailSchema } from '@/modules/auth/validation'
import {
  getMyProfile,
  updateMyProfile,
  profileInputSchema,
  type Profile,
  type ProfileInput,
} from './service'
import { uploadPrivateImage, privateImageUrl, removePrivateImage } from '@/lib/supabase/media'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/forms/controls'
import { PageHeader } from '@/components/layout/page'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/data-display/components'
function ProfileEditor({ profile, setup }: { profile: Profile; setup: boolean }) {
  const navigate = useNavigate()
  const cache = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const emailChange = useMutation({
    mutationFn: () => changeEmail(emailSchema.parse(newEmail.trim())),
    onSuccess: () => {
      setNewEmail('')
      toast.success('Check the confirmation email(s) to complete your email change.')
    },
    onError: (error) => toast.error(error.message),
  })
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileInputSchema),
    defaultValues: {
      ...Object.fromEntries(
        Object.entries(emptyPersonal).map(([key, value]) => [
          key,
          profile[key as keyof Profile] ?? value,
        ]),
      ),
      full_name: profile.full_name,
      mobile_number: profile.mobile_number,
      address: profile.address ?? '',
      notification_settings: profile.notification_settings,
    },
  })
  const image = useQuery({
    queryKey: ['avatar', profile.id, profile.avatar_path],
    enabled: Boolean(profile.avatar_path),
    queryFn: () => privateImageUrl('avatars', profile.avatar_path!),
    staleTime: 50_000,
  })
  const mutation = useMutation({
    mutationFn: async (values: ProfileInput) => {
      let path = profile.avatar_path
      let uploaded: string | null = null
      try {
        if (file) {
          uploaded = await uploadPrivateImage('avatars', profile.id, file)
          path = uploaded
        }
        await updateMyProfile(values, path)
      } catch (error) {
        if (uploaded) await removePrivateImage('avatars', uploaded).catch(() => {})
        throw error
      }
      if (uploaded && profile.avatar_path)
        await removePrivateImage('avatars', profile.avatar_path).catch(() =>
          toast.warning('Profile saved. The previous avatar could not be removed.'),
        )
    },
    onSuccess: async () => {
      setFile(null)
      await cache.invalidateQueries({ queryKey: ['profile'] })
      await cache.invalidateQueries({ queryKey: ['access'] })
      toast.success(
        setup ? 'Personal information saved. Your account is ready.' : 'Profile updated.',
      )
      if (setup) navigate(pendingInvitationPath(), { replace: true })
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <section className="panel">
      <div className="profile-summary">
        {image.data && <img className="profile-image" src={image.data} alt="Your profile avatar" />}
        <div>
          <h2>{profile.full_name || 'Your profile'}</h2>
          <p>{profile.email}</p>
          <StatusBadge status={profile.account_status === 'active' ? 'success' : 'danger'}>
            {profile.account_status}
          </StatusBadge>
        </div>
      </div>
      <form
        className="component-spacing"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <PersonalFields form={form} />
        <FormField
          id="profile-mobile"
          label="Mobile number"
          error={form.formState.errors.mobile_number?.message}
        >
          <input
            id="profile-mobile"
            type="tel"
            autoComplete="tel"
            {...form.register('mobile_number')}
            aria-invalid={Boolean(form.formState.errors.mobile_number)}
            aria-describedby={
              form.formState.errors.mobile_number ? 'profile-mobile-error' : undefined
            }
          />
        </FormField>
        {!setup && (
          <label>
            Avatar (private)
            <input
              key={profile.updated_at}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="field-hint">PNG, JPEG or WebP · Up to 2 MB.</span>
          </label>
        )}
        <fieldset>
          <legend>Notification preferences</legend>
          <label className="checkbox-label">
            <input type="checkbox" {...form.register('notification_settings.email')} />
            Email notifications
          </label>
          <label className="checkbox-label">
            <input type="checkbox" {...form.register('notification_settings.push')} />
            Push notifications
          </label>
          <p className="field-hint">
            Preferences are saved now. Push delivery will be connected in a later phase.
          </p>
        </fieldset>
        <div className="actions">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : setup ? 'Save and continue' : 'Save profile'}
          </Button>
          {!setup && (
            <Link className="button button-secondary" to="/security">
              Account security
            </Link>
          )}
        </div>
      </form>
      {!setup && (
        <form
          className="component-spacing"
          onSubmit={(e) => {
            e.preventDefault()
            emailChange.mutate()
          }}
        >
          <h2>Change email address</h2>
          <p>Your current email stays in use until the required confirmations are completed.</p>
          <label>
            New email address
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              maxLength={254}
              required
            />
          </label>
          <Button type="submit" disabled={emailChange.isPending}>
            Request email change
          </Button>
        </form>
      )}
      <dl className="profile-details">
        <dt>Created</dt>
        <dd>{new Date(profile.created_at).toLocaleString()}</dd>
        <dt>Updated</dt>
        <dd>{new Date(profile.updated_at).toLocaleString()}</dd>
      </dl>
    </section>
  )
}
export default function ProfilePage() {
  const { session, logout } = useSession()
  const setup = useLocation().pathname === '/profile/setup'
  const query = useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => getMyProfile(session!.user.id),
  })
  return (
    <>
      <PageHeader
        title={setup ? 'Complete your personal information' : 'Your profile'}
        description={
          setup
            ? 'Your email is verified. Complete these details before continuing to your workspace.'
            : 'Manage your personal information and notification preferences.'
        }
      />
      {setup && (
        <Button
          variant="ghost"
          onClick={() => void logout().catch((error) => toast.error(error.message))}
        >
          Sign out and finish later
        </Button>
      )}
      {!session ? (
        <section className="panel">
          <p>Sign in to manage your profile.</p>
        </section>
      ) : query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <ProfileEditor key={query.data.updated_at} profile={query.data} setup={setup} />
      )}
    </>
  )
}
