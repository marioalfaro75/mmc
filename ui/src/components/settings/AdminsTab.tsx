'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { fetchApi } from '@/lib/utils/fetchApi';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  username: string;
  createdAt: string;
}

export function AdminsTab() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { hasAdmins, isAdmin } = useAuth();

  const { data, isLoading } = useQuery<{ admins: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => fetchApi<{ admins: AdminUser[] }>('/api/auth/admins'),
    enabled: isAdmin,
  });

  // Use /api/auth/setup for first admin, /api/auth/admins for subsequent
  const addMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => {
      const url = hasAdmins ? '/api/auth/admins' : '/api/auth/setup';
      return fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
      setShowAdd(false);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      toast.success('Admin added');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add admin'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, username, password }: { id: string; username?: string; password?: string }) =>
      fetchApi(`/api/auth/admins/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: password || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditId(null);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      toast.success('Admin updated');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update admin'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/auth/admins/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteConfirmId(null);
      toast.success('Admin removed');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove admin'),
  });

  const admins = data?.admins ?? [];

  const handleAdd = () => {
    if (username.length < 3 || password.length < 8) {
      toast.error('Username min 3 chars, password min 8 chars');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    addMutation.mutate({ username, password });
  };

  const handleUpdate = () => {
    if (!editId) return;
    if (username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (password && password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    updateMutation.mutate({ id: editId, username, password: password || undefined });
  };

  const startEdit = (admin: AdminUser) => {
    setEditId(admin.id);
    setUsername(admin.username);
    setPassword('');
    setConfirmPassword('');
    setShowAdd(false);
  };

  const cancelEdit = () => {
    setEditId(null);
    setShowAdd(false);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  };

  // Auto-show add form when no admins exist
  const showAddForm = showAdd || !hasAdmins;

  if (isLoading && isAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hasAdmins && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          <p>No admin accounts have been created yet. Create your first admin to enable login protection for admin pages.</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4 text-base">
            <span>Admin Users</span>
            {!showAddForm && !editId && (
              <button
                onClick={() => { setShowAdd(true); setUsername(''); setPassword(''); setConfirmPassword(''); }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Admin
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 space-y-3">
          {admins.map(admin => (
            <div key={admin.id}>
              {editId === admin.id ? (
                <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      New Password <span className="text-muted-foreground">(leave blank to keep current)</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                    />
                  </div>
                  {password && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        autoComplete="new-password"
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{admin.username}</span>
                    <Badge variant="outline">
                      Added {new Date(admin.createdAt).toLocaleDateString()}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(admin)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {admins.length > 1 && (
                      deleteConfirmId === admin.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate(admin.id)}
                            disabled={deleteMutation.isPending}
                            className="rounded-md bg-danger px-2 py-1 text-xs text-white hover:bg-danger/80"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(admin.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add form */}
          {showAddForm && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Min. 3 characters"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Admin
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
