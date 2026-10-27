import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-display/components'
import {
  inviteMember,
  revokeInvitation,
  sendInvitation,
  type CreatedInvitation,
  type Invitation,
} from './service'
import { groupInvitationLink } from './intent'
export function GroupInvitations({
  groupId,
  invitations,
}: {
  groupId: string
  invitations: Invitation[]
}) {
  const cache = useQueryClient()
  const [open, setOpen] = useState(false)
  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => cache.invalidateQueries({ queryKey: ['memberships'] }),
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="panel component-spacing">
      <div className="section-heading">
        <h2>Group invitations</h2>
        <Button onClick={() => setOpen(true)}>Invite member</Button>
      </div>
      <p>
        Email invitations are bound to a verified email. Share links have limited uses and expire
        after at most seven days. Invitations do not reserve a seat.
      </p>
      <DataTable
        caption="Group invitations"
        rows={invitations}
        rowKey={(i) => i.id}
        columns={[
          { key: 'recipient', header: 'Recipient', render: (i) => i.email ?? 'Secure share link' },
          {
            key: 'state',
            header: 'Status',
            render: (i) =>
              i.revoked_at
                ? 'Revoked'
                : Date.parse(i.expires_at) <= Date.now()
                  ? 'Expired'
                  : i.use_count >= i.max_uses
                    ? 'Used'
                    : 'Open',
          },
          { key: 'uses', header: 'Uses', render: (i) => `${i.use_count} / ${i.max_uses}` },
          {
            key: 'expiry',
            header: 'Expires',
            render: (i) => new Date(i.expires_at).toLocaleString(),
          },
          {
            key: 'action',
            header: 'Actions',
            render: (i) =>
              !i.revoked_at &&
              i.use_count < i.max_uses && (
                <Button
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(i.id)}
                >
                  Revoke invitation
                </Button>
              ),
          },
        ]}
      />
      {open && <InviteDialog groupId={groupId} onClose={() => setOpen(false)} />}
    </section>
  )
}
function InviteDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const id = useId()
  const cache = useQueryClient()
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState('email')
  const [uses, setUses] = useState(1)
  const [hours, setHours] = useState(168)
  const [created, setCreated] = useState<CreatedInvitation | null>(null)
  const create = useMutation({
    mutationFn: () =>
      inviteMember(groupId, {
        email: mode === 'email' ? email.trim() : '',
        max_uses: uses,
        expires_hours: hours,
      }),
    onSuccess: async (i) => {
      setCreated(i)
      await cache.invalidateQueries({ queryKey: ['memberships'] })
    },
    onError: (e) => toast.error(e.message),
  })
  const send = useMutation({
    mutationFn: () => sendInvitation(created!),
    onSuccess: () => toast.success('Invitation email accepted by the delivery provider.'),
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={id} onClose={onClose} busy={create.isPending || send.isPending}>
      <h2 id={id}>Invite a group member</h2>
      {!created ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <label>
            Invitation method
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="email">Email invitation</option>
              <option value="link">Secure invitation link</option>
            </select>
          </label>
          {mode === 'email' ? (
            <label>
              Email address
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          ) : (
            <label>
              Maximum uses
              <input
                type="number"
                required
                min={1}
                max={1000}
                value={uses}
                onChange={(e) => setUses(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            Expires in hours
            <input
              type="number"
              required
              min={1}
              max={168}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
          <p>
            Only organization owners can invite people outside the organization. Accepting an owner
            invitation can also create basic organization membership.
          </p>
          <div className="actions">
            <Button type="submit" disabled={create.isPending}>
              Create secure invitation
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <p>
            Copy this link now. Its secret is displayed once and is stored only as a hash on the
            server.
          </p>
          <label>
            Secure group invitation link
            <input readOnly value={groupInvitationLink(created.id, created.token)} />
          </label>
          <div className="actions component-spacing">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    groupInvitationLink(created.id, created.token),
                  )
                  toast.success('Invitation link copied.')
                } catch {
                  toast.error('Select and copy the invitation link manually.')
                }
              }}
            >
              Copy link
            </Button>
            {created.email && (
              <Button disabled={send.isPending} onClick={() => send.mutate()}>
                Send invitation email
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
