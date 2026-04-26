'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { Button } from '@/components/ui/button';
import { CreateUserModal } from '@/components/create-user-modal';
import {
  EditUserRoleModal,
  type EditUserRoleTarget,
} from '@/components/edit-user-role-modal';
import {
  DeleteUserModal,
  type DeleteUserTarget,
} from '@/components/delete-user-modal';
import { useToast } from '@/components/toast-provider';
import { cn } from '@/lib/utils';

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  force_password_change: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showToast } = useToast();

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditUserRoleTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteUserTarget | null>(null);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      showToast('Admin access required', 'error');
      router.push('/dashboard');
    }
  }, [status, session, router, showToast]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to load users (${res.status})`);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.role]);

  const handleLogout = async () => {
    setIsLogoutOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') {
    return null;
  }

  const currentUserId = session.user.id;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutOpen(true)} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-8">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-2">Users</h2>
                <p className="text-foreground/60">
                  Manage backoffice access and roles
                </p>
              </div>
              <Button
                onClick={() => setIsCreateOpen(true)}
                className="bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
              >
                <Plus className="w-4 h-4 mr-2" /> Create User
              </Button>
            </div>

            <div className="rounded-xl border border-sidebar-border bg-sidebar/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-sidebar-border bg-sidebar-accent/20">
                    <tr className="text-left text-foreground/70">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Last login</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading &&
                      [0, 1, 2, 3, 4].map((i) => (
                        <tr
                          key={`skeleton-${i}`}
                          className="border-b border-sidebar-border last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="h-4 w-32 bg-sidebar-accent/40 rounded animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-4 w-48 bg-sidebar-accent/30 rounded animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-6 w-20 bg-sidebar-accent/30 rounded-full animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-6 w-20 bg-sidebar-accent/30 rounded-full animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-4 w-24 bg-sidebar-accent/25 rounded animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-4 w-24 bg-sidebar-accent/25 rounded animate-pulse" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <div className="h-8 w-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                              <div className="h-8 w-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    {!loading && error && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-red-400">
                          {error}
                        </td>
                      </tr>
                    )}
                    {!loading && !error && users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                          No users yet.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      !error &&
                      users.map((u) => {
                        const isSelf = u.id === currentUserId;
                        return (
                          <tr
                            key={u.id}
                            className="border-b border-sidebar-border last:border-0 hover:bg-sidebar-accent/10"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              {u.name}
                              {isSelf && (
                                <span className="ml-2 text-xs text-foreground/50">(you)</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-foreground/80">{u.email}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                                  u.role === 'ADMIN'
                                    ? 'bg-solar-gold/20 text-solar-gold'
                                    : 'bg-sidebar-accent/40 text-foreground/70',
                                )}
                              >
                                {u.role === 'ADMIN' ? (
                                  <Shield className="w-3 h-3" strokeWidth={2} />
                                ) : (
                                  <UserIcon className="w-3 h-3" strokeWidth={2} />
                                )}
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
                                  u.status === 'ACTIVE'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : u.status === 'SUSPENDED'
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-sidebar-accent/40 text-foreground/60',
                                )}
                              >
                                {u.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {formatDate(u.created_at)}
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {formatDate(u.last_login_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() =>
                                    setEditTarget({
                                      id: u.id,
                                      email: u.email,
                                      name: u.name,
                                      role: u.role,
                                    })
                                  }
                                  disabled={isSelf}
                                  title={isSelf ? "You can't change your own role" : 'Edit role'}
                                  className="p-2 rounded-lg hover:bg-sidebar-accent/30 text-foreground/70 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Pencil className="w-4 h-4" strokeWidth={1.5} />
                                </button>
                                <button
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: u.id,
                                      email: u.email,
                                      name: u.name,
                                    })
                                  }
                                  disabled={isSelf}
                                  title={isSelf ? "You can't delete yourself" : 'Delete user'}
                                  className="p-2 rounded-lg hover:bg-red-500/10 text-foreground/70 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>

        <CreateUserModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={fetchUsers}
        />
        <EditUserRoleModal
          isOpen={editTarget !== null}
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={fetchUsers}
        />
        <DeleteUserModal
          isOpen={deleteTarget !== null}
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={fetchUsers}
        />
        <LogoutModal
          isOpen={isLogoutOpen}
          onConfirm={handleLogout}
          onCancel={() => setIsLogoutOpen(false)}
        />
      </div>
    </div>
  );
}
