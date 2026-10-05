import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Phone, PhoneOff, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/useLanguage";

const PRESETS = ["mom", "dad", "brother", "friend"] as const;
const DELAYS = [0, 10, 30, 60, 300];
const SAVE_KEY = "jr_fake_caller";

/** Simple phone-like ringtone generated with Web Audio (no files needed). */
function startRingtone() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  let stopped = false;
  const ring = () => {
    if (stopped) return;
    [0, 0.5].forEach((off) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 440;
      const o2 = ctx.createOscillator();
      o2.frequency.value = 480;
      g.gain.value = 0.15;
      o.connect(g); o2.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + off;
      o.start(t0); o2.start(t0); o.stop(t0 + 0.4); o2.stop(t0 + 0.4);
    });
    navigator.vibrate?.([800, 400, 800]);
  };
  ring();
  const id = setInterval(ring, 2500);
  return () => {
    stopped = true;
    clearInterval(id);
    navigator.vibrate?.(0);
    ctx.close().catch(() => {});
  };
}

const FakeCallPage = () => {
  const { t } = useLanguage();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); } catch { return null; } })();
  const [name, setName] = useState<string>(saved?.name ?? t("fakeCall.mom"));
  const [number, setNumber] = useState<string>(saved?.number ?? "");
  const [delay, setDelay] = useState<number>(10);
  const [status, setStatus] = useState<"setup" | "waiting" | "ringing" | "ongoing" | "ended">("setup");
  const [left, setLeft] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const stopRing = useRef<() => void>(() => {});

  useEffect(() => {
    if (status !== "waiting") return;
    if (left <= 0) { setStatus("ringing"); return; }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [status, left]);

  useEffect(() => {
    if (status === "ringing") stopRing.current = startRingtone();
    else stopRing.current();
  }, [status]);

  useEffect(() => () => stopRing.current(), []);

  useEffect(() => {
    if (status !== "ongoing") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const delayLabel = (d: number) => (d === 0 ? t("fakeCall.now") : d < 60 ? t("fakeCall.sec", { n: d }) : t("fakeCall.min", { n: d / 60 }));

  const schedule = () => {
    const finalName = name.trim() || t("fakeCall.mom");
    setName(finalName);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ name: finalName, number }));
    setSeconds(0);
    setLeft(delay);
    setStatus(delay === 0 ? "ringing" : "waiting");
  };

  if (status === "ringing") {
    return (
      <div className="fixed inset-0 z-50 bg-foreground flex flex-col items-center justify-between py-16 px-6 text-center text-background animate-in fade-in duration-300">
        <div>
          <p className="opacity-70 text-sm uppercase tracking-wider mb-6">{t("fakeCall.incoming")}</p>
          <div className="w-28 h-28 rounded-full bg-background/10 flex items-center justify-center mx-auto mb-5 animate-pulse">
            <User className="w-14 h-14" />
          </div>
          <h2 className="text-4xl font-bold mb-1">{name}</h2>
          <p className="opacity-60 text-lg">{number || t("fakeCall.mobile")}</p>
        </div>
        <div className="flex gap-16">
          <button aria-label="Decline" onClick={() => setStatus("ended")} className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg active:scale-95">
            <PhoneOff className="w-7 h-7" />
          </button>
          <button aria-label="Answer" onClick={() => setStatus("ongoing")} className="w-16 h-16 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shadow-lg active:scale-95 animate-bounce">
            <Phone className="w-7 h-7" />
          </button>
        </div>
      </div>
    );
  }

  if (status === "ongoing") {
    return (
      <div className="fixed inset-0 z-50 bg-foreground text-background flex flex-col items-center justify-between py-12 px-6 animate-in fade-in duration-300">
        <div className="text-center space-y-2">
          <p className="opacity-70 text-sm uppercase tracking-wider">{t("fakeCall.ongoing")}</p>
          <div className="w-20 h-20 rounded-full bg-background/10 flex items-center justify-center mx-auto"><User className="w-10 h-10" /></div>
          <h2 className="text-3xl font-bold">{name}</h2>
          <p className="opacity-60 text-sm">{number || t("fakeCall.mobile")}</p>
        </div>
        <div className="opacity-80 text-3xl font-mono tabular-nums">{fmt(seconds)}</div>
        <button aria-label="End call" onClick={() => setStatus("ended")} className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg active:scale-95">
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="fixed inset-0 z-50 bg-foreground text-background flex flex-col items-center justify-center text-center p-6">
        <PhoneOff className="w-12 h-12 opacity-50 mb-4" />
        <p className="text-lg font-semibold">{t("fakeCall.ended")}</p>
        <p className="opacity-70 text-sm mt-2">{t("fakeCall.duration", { time: fmt(seconds) })}</p>
        <div className="flex gap-3 mt-8">
          <Button variant="secondary" onClick={() => setStatus("setup")}>{t("fakeCall.title")}</Button>
          <Link to="/dashboard"><Button variant="secondary">{t("fakeCall.back")}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-trust text-secondary-foreground">
        <div className="container py-6">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm opacity-90 mb-3">
            <ArrowLeft className="w-4 h-4" /> {t("common.back")}
          </Link>
          <h1 className="text-2xl font-bold">{t("fakeCall.title")}</h1>
          <p className="text-sm opacity-80 mt-1">{t("fakeCall.sub")}</p>
        </div>
      </header>

      <main className="container py-6 space-y-5">
        {status === "waiting" ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
            <Clock className="w-8 h-8 mx-auto text-secondary" />
            <p className="text-4xl font-bold tabular-nums">{fmt(left)}</p>
            <p className="text-sm text-muted-foreground">{t("fakeCall.scheduled", { time: fmt(left) })}</p>
            <Button variant="outline" onClick={() => setStatus("setup")}>{t("fakeCall.cancel")}</Button>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("fakeCall.caller")}</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => setName(t(`fakeCall.${p}`))}
                    className={`px-4 py-2 rounded-full border text-sm ${name === t(`fakeCall.${p}`) ? "bg-secondary text-secondary-foreground border-secondary" : "border-border bg-card"}`}>
                    {t(`fakeCall.${p}`)}
                  </button>
                ))}
              </div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fakeCall.customName")} maxLength={40} />
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t("fakeCall.customNumber")} inputMode="tel" maxLength={20} />
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("fakeCall.when")}</p>
              <div className="grid grid-cols-5 gap-2">
                {DELAYS.map((d) => (
                  <button key={d} onClick={() => setDelay(d)}
                    className={`py-2 rounded-xl border text-xs font-semibold ${delay === d ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}>
                    {delayLabel(d)}
                  </button>
                ))}
              </div>
            </section>

            <Button onClick={schedule} className="w-full h-14 bg-gradient-emergency shadow-emergency text-base">
              <Phone className="w-5 h-5 mr-2" /> {t("fakeCall.start")}
            </Button>

            <div className="p-4 bg-accent/50 rounded-2xl text-sm text-accent-foreground flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{t("fakeCall.tip")}</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default FakeCallPage;
