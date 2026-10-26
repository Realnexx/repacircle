import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, Plus, X } from 'lucide-react'
import { useSession } from '@/modules/auth/session'
import { useAccess } from '@/app/providers/access'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErrorState, LoadingSkeleton, EmptyState } from '@/components/feedback/states'
import { FormField } from '@/components/forms/controls'
import { StatusBadge } from '@/components/data-display/components'
import Setup from '@/components/layout/setup'
import { command } from '@/lib/api/client'
import { uploadPrivateImage, removePrivateImage, privateImageUrl } from '@/lib/supabase/media'
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  organizationDetailsSchema,
  type Organization,
} from './service'
import { OrganizationMembers } from './members'
export default function Organizations() {
  const { session } = useSession()
  const access = useAccess()
  const cache = useQueryClient()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const form = useForm<{ name: string; description: string }>({
    resolver: zodResolver(organizationDetailsSchema),
    defaultValues: { name: '', description: '' },
  })
  const query = useQuery({
    queryKey: ['organizations', session?.user.id],
    queryFn: listOrganizations,
    enabled: Boolean(session),
  })
  const create = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      createOrganization(values, requestId),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['organizations'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      setOpen(false)
      setStep(1)
      form.reset()
      setRequestId(crypto.randomUUID())
      toast.success('Organization created.')
    },
    onError: (error) => toast.error(error.message),
  })
  if (!session) return <Setup />
  const selected = query.data?.find((org) => org.id === access.organizationId)
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Your organizations</h2>
            <p>Each organization has separate membership, permissions and records.</p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            Create organization
          </Button>
        </div>
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data?.length ? (
          <div className="organization-list">
            {query.data.map((org) => (
              <article key={org.id}>
                <div className="setup-icon">
                  <Building2 />
                </div>
                <div>
                  <h3>{org.name}</h3>
                  <p>{org.description || 'No description yet.'}</p>
                  <StatusBadge status={org.status === 'active' ? 'success' : 'neutral'}>
                    {org.status}
                  </StatusBadge>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => access.selectOrganization(org.id)}
                  aria-pressed={org.id === access.organizationId}
                >
                  {org.id === access.organizationId ? 'Selected' : 'Select organization'}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Create a home for your community"
            description="Create your first organization or accept an invitation from its owner."
          />
        )}
      </section>
      {selected && <OrganizationSettings key={selected.id} organization={selected} />}{' '}
      {open && (
        <Modal onClose={() => setOpen(false)} busy={create.isPending}>
          <div className="section-heading">
            <h2 id="dialog-title">Create organization</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close dialog"
              disabled={create.isPending}
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          {access.aal !== 'aal2' ? (
            <>
              <p>Organization owners must verify an authenticator before creating a tenant.</p>
              <Link className="button" to="/security">
                Set up or verify MFA
              </Link>
            </>
          ) : (
            <form
              className="component-spacing"
              onSubmit={form.handleSubmit((values) => {
                if (step === 1) setStep(2)
                else create.mutate(values)
              })}
            >
              <p>
                Step {step} of 2 · {step === 1 ? 'Organization details' : 'Review and create'}
              </p>
              {step === 1 ? (
                <>
                  <FormField
                    id="org-name"
                    label="Organization name"
                    error={form.formState.errors.name?.message}
                  >
                    <input
                      id="org-name"
                      {...form.register('name')}
                      maxLength={80}
                      aria-invalid={Boolean(form.formState.errors.name)}
                      aria-describedby={form.formState.errors.name ? 'org-name-error' : undefined}
                    />
                  </FormField>
                  <FormField
                    id="org-description"
                    label="Description"
                    error={form.formState.errors.description?.message}
                  >
                    <textarea
                      id="org-description"
                      rows={3}
                      {...form.register('description')}
                      maxLength={2000}
                    />
                  </FormField>
                </>
              ) : (
                <div>
                  <h3>{form.getValues('name')}</h3>
                  <p>{form.getValues('description') || 'No description.'}</p>
                  <p>
                    You will become the organization owner. You can upload its logo and invite staff
                    after creation.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={create.isPending}
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                </div>
              )}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending
                  ? 'Creating…'
                  : step === 1
                    ? 'Review organization'
                    : 'Create organization'}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
export function OrganizationSettings({ organization }: { organization: Organization }) {
  const access = useAccess()
  const cache = useQueryClient()
  const [name, setName] = useState(organization.name)
  const [description, setDescription] = useState(organization.description)
  const [file, setFile] = useState<File | null>(null)
  const [confirm, setConfirm] = useState<'leave' | 'archive' | null>(null)
  const allowed = access.can('organization.update')
  const image = useQuery({
    queryKey: ['organization-logo', organization.id, organization.logo_path],
    enabled: Boolean(organization.logo_path),
    queryFn: () => privateImageUrl('organization-logos', organization.logo_path!),
    staleTime: 50_000,
  })
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['organizations'] }),
      cache.invalidateQueries({ queryKey: ['access'] }),
    ])
  }
  const save = useMutation({
    mutationFn: async () => {
      let path = organization.logo_path
      let uploaded: string | null = null
      try {
        if (file) {
          uploaded = await uploadPrivateImage('organization-logos', organization.id, file)
          path = uploaded
        }
        await updateOrganization(organization, { name, description }, path)
      } catch (error) {
        if (uploaded) await removePrivateImage('organization-logos', uploaded).catch(() => {})
        throw error
      }
      if (uploaded && organization.logo_path)
        await removePrivateImage('organization-logos', organization.logo_path).catch(() =>
          toast.warning('Details saved; the old logo could not be removed.'),
        )
    },
    onSuccess: async () => {
      setFile(null)
      await refresh()
      toast.success('Organization updated.')
    },
    onError: (error) => toast.error(error.message),
  })
  const close = useMutation({
    mutationFn: (action: 'leave' | 'archive') =>
      command(action === 'leave' ? 'leave_organization' : 'archive_organization', {
        target: organization.id,
      }),
    onSuccess: async () => {
      setConfirm(null)
      await refresh()
      toast.success('Organization membership or status updated.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <div className="component-spacing">
      <section className="panel">
        <div className="profile-summary">
          {image.data && (
            <img className="profile-image" src={image.data} alt={`${organization.name} logo`} />
          )}
          <div>
            <h2>{organization.name}</h2>
            <p>
              {access.organization?.role} · {organization.status}
            </p>
          </div>
        </div>
        {allowed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <label>
              Organization name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </label>
            <label>
              Organization logo
              <input
                key={organization.updated_at}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="field-hint">Private PNG, JPEG or WebP · Up to 2 MB.</span>
            </label>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save organization'}
            </Button>
          </form>
        ) : (
          <p>
            {access.organization?.role === 'owner' && access.aal !== 'aal2' ? (
              <Link className="text-button" to="/security">
                Verify MFA to manage this organization.
              </Link>
            ) : (
              'Organization details can be changed by its owner.'
            )}
          </p>
        )}
        <div className="actions component-spacing">
          {access.organization?.role !== 'owner' && (
            <Button variant="secondary" onClick={() => setConfirm('leave')}>
              Leave organization
            </Button>
          )}
          {access.can('organization.archive') && (
            <Button variant="danger" onClick={() => setConfirm('archive')}>
              Archive organization
            </Button>
          )}
        </div>
        <p className="field-hint component-spacing">
          Owners must transfer ownership before leaving. Archival is blocked by unresolved records.
          Hard deletion is disabled.
        </p>
      </section>
      {organization.status === 'active' && (
        <OrganizationMembers key={organization.id} target={organization.id} />
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'archive' ? 'Archive this organization?' : 'Leave this organization?'}
        description={
          confirm === 'archive'
            ? 'The organization becomes read-only and pending invitations are revoked. This is not a hard deletion.'
            : 'You will lose access to this organization and its group assignments.'
        }
        busy={close.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && close.mutate(confirm)}
      />
    </div>
  )
}
