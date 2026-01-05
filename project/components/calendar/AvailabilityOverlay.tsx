import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
import { isSupabaseConfigured, supabase, supabaseConfigError, UserSettings } from '@/lib/supabase';

type AvailabilityState = {
  enabled: boolean;
  days: Record<string, boolean>;
  start: string;
  end: string;
};

const DAY_KEYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

export default function AvailabilityOverlay() {
  const { user, loading } = useAuth();
  const [availability, setAvailability] = useState<AvailabilityState>({
    enabled: false,
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    start: '09:00',
    end: '17:00',
  });
  const [bufferMinutes, setBufferMinutes] = useState<number>(15);
  const [saving, setSaving] = useState(false);

  const canUseSupabase = isSupabaseConfigured;

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!canUseSupabase) return;

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          // if no row exists yet, keep defaults
          return;
        }

        const settings = data as UserSettings;
        const raw = (settings.availability || {}) as any;
        const next: AvailabilityState = {
          enabled: Boolean(raw.enabled),
          days: {
            mon: Boolean(raw.days?.mon ?? true),
            tue: Boolean(raw.days?.tue ?? true),
            wed: Boolean(raw.days?.wed ?? true),
            thu: Boolean(raw.days?.thu ?? true),
            fri: Boolean(raw.days?.fri ?? true),
            sat: Boolean(raw.days?.sat ?? false),
            sun: Boolean(raw.days?.sun ?? false),
          },
          start: typeof raw.start === 'string' ? raw.start : '09:00',
          end: typeof raw.end === 'string' ? raw.end : '17:00',
        };

        setAvailability(next);
        setBufferMinutes(settings.buffer_minutes ?? 15);
      } catch (err) {
        console.error('Failed to load availability settings', err);
      }
    };

    void run();
  }, [loading, user, canUseSupabase]);

  const selectedDaysCount = useMemo(
    () => Object.values(availability.days).filter(Boolean).length,
    [availability.days]
  );

  const save = async () => {
    if (!user) return;
    if (!canUseSupabase) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            id: user.id,
            availability: availability as any,
            buffer_minutes: bufferMinutes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      if (error) throw error;
    } catch (err) {
      console.error('Failed to save availability settings', err);
      alert('Failed to save availability.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Weekly availability</p>
            <p className="text-sm text-skillswap-600">
              {availability.enabled ? `${selectedDaysCount} days enabled` : 'Off'} • {availability.start}–{availability.end}
            </p>
          </div>
          <Switch
            checked={availability.enabled}
            onCheckedChange={(v) => setAvailability((prev) => ({ ...prev, enabled: Boolean(v) }))}
            disabled={!user || !canUseSupabase}
          />
        </div>

        {availability.enabled ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-7 gap-2">
              {DAY_KEYS.map((d) => (
                <div key={d.key} className="flex flex-col items-center gap-1">
                  <Label className="text-xs text-skillswap-600">{d.label}</Label>
                  <Checkbox
                    checked={availability.days[d.key]}
                    onCheckedChange={(v) =>
                      setAvailability((prev) => ({
                        ...prev,
                        days: { ...prev.days, [d.key]: Boolean(v) },
                      }))
                    }
                    disabled={!user || !canUseSupabase}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={availability.start} onChange={(e) => setAvailability((p) => ({ ...p, start: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={availability.end} onChange={(e) => setAvailability((p) => ({ ...p, end: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !user || !canUseSupabase} className="bg-skillswap-500 text-white">
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-3">
        <p className="text-sm text-skillswap-600">Buffer between sessions: {bufferMinutes} minutes</p>
      </Card>
    </div>
  );
}
