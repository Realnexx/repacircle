import { useState } from 'react'
import { Building2, Plus, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/modules/auth/session'
import { createOrganization, listOrganizations, organizationSchema } from './service'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import Setup from '@/components/layout/setup'
export default function Organizations() {
  const { session } = useSession()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const form = useForm<{ name: string }>({ resolver: zodResolver(organizationSchema) })
  const query = useQuery({
    queryKey: ['organizations', session?.user.id],
    queryFn: listOrganizations,
    enabled: Boolean(session && supabase),
  })
  const mutation = useMutation({
    mutationFn: (input: { name: string }) => createOrganization(input, requestId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['organizations'] }),
        client.invalidateQueries({ queryKey: ['access'] }),
      ])
      setOpen(false)
      form.reset()
      setRequestId(crypto.randomUUID())
      toast.success('Organization created. Your community has a home.')
    },
    onError: (error) => toast.error(error.message),
  })
  if (!supabase) return <Setup />
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Your organizations</h2>
          <p>Independent spaces for each community you manage.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          Create organization
        </Button>
      </div>
      {query.isPending ? (
        <div className="skeleton" role="status">
          Loading organizations…
        </div>
      ) : query.isError ? (
        <div role="alert">
          <p className="error">{query.error.message}</p>
          <Button className="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data?.length ? (
        <div className="organization-list">
          {query.data.map((org) => (
            <article key={org.id}>
              <div className="setup-icon">
                <Building2 />
              </div>
              <div>
                <h3>{org.name}</h3>
                <p>Created {new Date(org.created_at).toLocaleDateString('en-PH')}</p>
              </div>
              <span className="badge">Organization</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Building2 size={32} />
          <h3>A home for your community</h3>
          <p>
            Create your first organization to get started.
            <br />
            Your groups and members will belong to this space.
          </p>
          <Button className="secondary" onClick={() => setOpen(true)}>
            <Plus size={16} />
            Create your first organization
          </Button>
        </div>
      )}
      {open && (
        <Modal onClose={() => setOpen(false)} busy={mutation.isPending}>
          <div className="section-heading">
            <h2 id="dialog-title">Create organization</h2>
            <button
              autoFocus
              aria-label="Close dialog"
              className="icon-button"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
          </div>
          <p>Give your community a name. You’ll become its owner.</p>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
            <label>
              Organization name
              <input
                {...form.register('name')}
                maxLength={80}
                placeholder="e.g. Bayanihan Savings Circle"
                aria-invalid={Boolean(form.formState.errors.name)}
                aria-describedby={
                  form.formState.errors.name ? 'organization-name-error' : undefined
                }
              />
            </label>
            {form.formState.errors.name && (
              <p className="error" id="organization-name-error" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  )
}
