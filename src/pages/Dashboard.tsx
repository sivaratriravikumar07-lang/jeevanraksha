import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Users, LogOut,
  Phone, Hospital, PhoneCall, Activity, MessageSquare, BookOpen,
  Share2, Navigation, Heart, WifiOff, Camera, Mic,
  Timer, HeartPulse, Sparkles,
  ShieldCheck, MapPinned, AlertTriangle, Calculator as CalcIcon,
  Baby,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VoiceActivation } from "@/components/VoiceActivation";
import { FakeCall } from "@/components/FakeCall";
import { SoundDetector } from "@/components/SoundDetector";
import { BottomNav } from "@/components/BottomNav";
import { SOSButton } from "@/components/SOSButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useVolumeSOS } from "@/hooks/useVolumeSOS";
import { vibrate, getCurrentPosition } from "@/lib/emergency";
import { buildEmergencyMessage, openSmsToAll, type ContactLite } from "@/lib/sms";
import { useLanguage } from "@/hooks/useLanguage";
import { readAllPermissions, watchPermissions } from "@/lib/permissions";


interface Profile { full_name: string; phone: string | null; }
interface Contact { id: string }

const Dashboard = () => {
  const { user, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contactsCount, setContactsCount] = useState(0);
  const [incidentsCount, setIncidentsCount] = useState(0);
  const [showFake, setShowFake] = useState(false);
  const [permsReady, setPermsReady] = useState(0);

  useEffect(() => {
    const refresh = () =>
      readAllPermissions().then((s) =>
        setPermsReady(Object.values(s).filter((v) => v === "granted" || v === "unsupported").length),
      );
    refresh();
    return watchPermissions(refresh);
  }, []);

  const isResponder = roles.includes("admin") || roles.includes("police") || roles.includes("hospital");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, c, i] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase.from("emergency_contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setProfile(p.data);
      setContactsCount(c.count ?? 0);
      setIncidentsCount(i.count ?? 0);
    })();
  }, [user]);

  // Hardware volume button pressed 3x → SMS to contacts + call Police 100
  useVolumeSOS(() => {
    vibrate([300, 100, 300, 100, 600]);
    toast.error("Volume 3x detected — sending SOS SMS & calling Police 100…");

    (async () => {
      if (!user) return;
      let lat = 0, lng = 0;
      try {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        toast.warning("GPS unavailable — SMS will be sent without location.");
      }

      const [{ data: profile }, { data: cs }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, blood_group, emergency_message").eq("id", user.id).maybeSingle(),
        supabase.from("emergency_contacts").select("name, phone, email").eq("user_id", user.id),
      ]);
      const list = (cs ?? []) as ContactLite[];

      const msg = buildEmergencyMessage(
        {
          name: profile?.full_name ?? "A Jeevan Raksha user",
          phone: profile?.phone,
          bloodGroup: profile?.blood_group,
          note: profile?.emergency_message,
        },
        lat && lng ? { lat, lng } : null,
      );

      // Try auto-SMS gateway first
      try {
        const incident = await supabase.from("incidents").insert({
          user_id: user.id, type: "sos", status: "active",
          latitude: lat || null, longitude: lng || null,
        }).select().single();
        const { data: smsRes, error: smsErr } = await supabase.functions.invoke("send-sos-sms", {
          body: { incidentId: incident.data?.id, latitude: lat || null, longitude: lng || null },
        });
        if (!smsErr && smsRes?.configured && smsRes?.sent > 0) {
          toast.success(`Auto SMS sent to ${smsRes.sent} contact${smsRes.sent > 1 ? "s" : ""} with live location.`);
        } else if (list.length && msg) {
          openSmsToAll(list, msg);
          toast.info(`SMS opened for ${list.length} contact${list.length > 1 ? "s" : ""}.`);
        }
      } catch {
        if (list.length && msg) {
          openSmsToAll(list, msg);
          toast.info(`SMS opened for ${list.length} contact${list.length > 1 ? "s" : ""}.`);
        }
      }

      // Call Police 100
      setTimeout(() => { window.location.href = "tel:100"; }, 2500);
    })();
  });

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/");
  };


  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-trust text-secondary-foreground">
        <div className="container py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Logo className="w-9 h-9" />
              <span className="font-bold">Jeevan Raksha</span>
            </div>

            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-secondary-foreground hover:bg-background/20">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm opacity-80">{t("dashboard.greeting",{name: profile?.full_name?.split(" ")[0] ?? ""})}</p>
            <h1 className="text-2xl font-bold mt-0.5">{t("dashboard.protected")}</h1>
            <p className="text-sm opacity-80 mt-1">{t("dashboard.sub")}</p>
          </div>
        </div>
      </header>

      <main className="container -mt-6 space-y-5">
        {/* Live access status */}
        {permsReady < 5 && (
          <button
            onClick={() => navigate("/permissions")}
            className="w-full flex items-center gap-3 p-4 bg-card border border-primary/40 rounded-2xl shadow-card text-left"
          >
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t("dashboard.permsTitle",{ready: permsReady})}</span>
              <span className="block text-xs text-muted-foreground">{t("dashboard.permsSub")}</span>
            </span>
          </button>
        )}

        {/* SOS Card */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-elevated text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("dashboard.sosLabel")}</p>
          <SOSButton onTrigger={() => navigate("/emergency")} holdSeconds={5} />
          <p className="text-xs text-muted-foreground mt-4">{t("dashboard.sosHint")}</p>
        </div>

        {/* Helplines */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{t("helplines.title")}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: "112", k: "emergency", c: "bg-gradient-emergency text-primary-foreground" },
              { n: "100", k: "police", c: "bg-gradient-emergency text-primary-foreground" },
              { n: "181", k: "women", c: "bg-gradient-trust text-secondary-foreground" },
              { n: "1091", k: "womenDistress", c: "bg-gradient-trust text-secondary-foreground" },
              { n: "1098", k: "child", c: "bg-gradient-trust text-secondary-foreground" },
              { n: "108", k: "ambulance", c: "bg-gradient-emergency text-primary-foreground" },
            ].map((h) => (
              <a key={h.n} href={`tel:${h.n}`} className={`${h.c} rounded-2xl p-3 text-center shadow-card active:scale-95 transition-transform`}>
                <Phone className="w-4 h-4 mx-auto mb-1 opacity-90" />
                <div className="font-extrabold text-lg leading-none">{h.n}</div>
                <div className="text-[10px] mt-1 leading-tight opacity-95">{t(`helplines.${h.k}`)}</div>
              </a>
            ))}
          </div>
        </section>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => navigate("/contacts")} className="p-3 bg-card border border-border rounded-2xl shadow-card text-center hover:border-primary/40">
            <Users className="w-4 h-4 text-secondary mx-auto mb-1" />
            <div className="text-xl font-bold">{contactsCount}</div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.contacts")}</div>
          </button>
          <button onClick={() => navigate("/history")} className="p-3 bg-card border border-border rounded-2xl shadow-card text-center hover:border-primary/40">
            <Activity className="w-4 h-4 text-primary mx-auto mb-1" />
            <div className="text-xl font-bold">{incidentsCount}</div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.incidents")}</div>
          </button>
          <button onClick={() => navigate("/safety-tips")} className="p-3 bg-card border border-border rounded-2xl shadow-card text-center hover:border-primary/40">
            <BookOpen className="w-4 h-4 text-secondary mx-auto mb-1" />
            <div className="text-xl font-bold">{t("dashboard.tips")}</div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.safety")}</div>
          </button>
        </div>

        {/* Quick action row */}
        <div className="grid grid-cols-2 gap-3">
          <a href="tel:100" className="flex items-center gap-3 p-4 bg-gradient-emergency rounded-2xl shadow-emergency text-primary-foreground">
            <Phone className="w-5 h-5" />
            <div>
              <div className="font-semibold text-sm">{t("dashboard.callPolice")}</div>
              <div className="text-xs opacity-90">100</div>
            </div>
          </a>
          <button onClick={() => setShowFake(true)} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left">
            <PhoneCall className="w-5 h-5 text-secondary" />
            <div>
              <div className="font-semibold text-sm">{t("dashboard.fakeCall")}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.fakeCallSub")}</div>
            </div>
          </button>
        </div>

        {/* Raksha AI chatbot */}
        <button
          onClick={() => navigate("/chat")}
          className="w-full flex items-center gap-3 p-4 bg-gradient-trust rounded-2xl shadow-trust text-secondary-foreground text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-background/20 backdrop-blur flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{t("dashboard.askAi")}</div>
            <div className="text-xs opacity-85">{t("dashboard.askAiSub")}</div>
          </div>
          <span className="text-xs font-semibold">{t("dashboard.chat")}</span>
        </button>

        {/* Sound Shield — accident / scream detection */}
        <SoundDetector onDetect={() => navigate("/emergency")} />


        {/* Voice SOS */}
        <VoiceActivation onTrigger={() => navigate("/emergency")} />

        <button
          onClick={() => navigate("/mic-test")}
          className="w-full flex items-center justify-between p-4 bg-accent/40 border border-accent rounded-2xl text-left hover:border-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Mic className="w-5 h-5 text-secondary" />
            <div>
              <div className="font-semibold text-sm">{t("dashboard.micTest")}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.micTestSub")}</div>
            </div>
          </div>
          <span className="text-xs text-secondary font-semibold">{t("dashboard.check")}</span>
        </button>

        {/* Nearby */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/police-stations")}
            className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">{t("dashboard.police")}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.nearYou")}</div>
            </div>
          </button>
          <button
            onClick={() => navigate("/hospitals")}
            className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0">
              <Hospital className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">{t("dashboard.hospitals")}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.nearYou")}</div>
            </div>
          </button>
        </div>

        {/* New advanced features */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{t("dashboard.more")}</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate("/share-location")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><Share2 className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.liveShare")}</div><div className="text-xs text-muted-foreground">{t("dashboard.liveShareSub")}</div></div>
            </button>
            <button onClick={() => navigate("/journey")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><Navigation className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.journey")}</div><div className="text-xs text-muted-foreground">{t("dashboard.journeySub")}</div></div>
            </button>
            <button onClick={() => navigate("/women-safety")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><Heart className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.womenMode")}</div><div className="text-xs text-muted-foreground">1091 · Disha</div></div>
            </button>
            <button onClick={() => navigate("/child-safety")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><Baby className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.childSafety")}</div><div className="text-xs text-muted-foreground">{t("dashboard.childSafetySub")}</div></div>
            </button>
            <button onClick={() => navigate("/offline-sos")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><WifiOff className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.offlineSos")}</div><div className="text-xs text-muted-foreground">{t("dashboard.offlineSosSub")}</div></div>
            </button>
            <button onClick={() => navigate("/panic-timer")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><Timer className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.checkinTimer")}</div><div className="text-xs text-muted-foreground">{t("dashboard.checkinTimerSub")}</div></div>
            </button>
            <button onClick={() => navigate("/first-aid")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><HeartPulse className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.firstAid")}</div><div className="text-xs text-muted-foreground">{t("dashboard.firstAidSub")}</div></div>
            </button>
            <button onClick={() => navigate("/evidence")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><Camera className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.evidence")}</div><div className="text-xs text-muted-foreground">{t("dashboard.evidenceSub")}</div></div>
            </button>
            <button onClick={() => navigate("/guardian")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.guardian")}</div><div className="text-xs text-muted-foreground">{t("dashboard.guardianSub")}</div></div>
            </button>
            <button onClick={() => navigate("/medical-id")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><HeartPulse className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.medicalId")}</div><div className="text-xs text-muted-foreground">{t("dashboard.medicalIdSub")}</div></div>
            </button>
            <button onClick={() => navigate("/danger-zones")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.dangerZones")}</div><div className="text-xs text-muted-foreground">{t("dashboard.dangerZonesSub")}</div></div>
            </button>
            <button onClick={() => navigate("/safe-zones")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><MapPinned className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">{t("dashboard.safeZones")}</div><div className="text-xs text-muted-foreground">{t("dashboard.safeZonesSub")}</div></div>
            </button>
            <button onClick={() => navigate("/calculator")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><CalcIcon className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">Disguise Mode</div><div className="text-xs text-muted-foreground">Calculator decoy</div></div>
            </button>
            <button onClick={() => navigate("/voice-protection")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-emergency flex items-center justify-center shrink-0"><Mic className="w-5 h-5 text-primary-foreground" /></div>
              <div><div className="font-semibold text-sm">Voice Protection</div><div className="text-xs text-muted-foreground">Say "Help Me" → SOS</div></div>
            </button>
            <button onClick={() => navigate("/volunteer")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">Nearby Volunteers</div><div className="text-xs text-muted-foreground">Help or get help within 3 km</div></div>
            </button>
            <button onClick={() => navigate("/permissions")} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-card text-left hover:border-primary/40">
              <div className="w-10 h-10 rounded-xl bg-gradient-trust flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-secondary-foreground" /></div>
              <div><div className="font-semibold text-sm">Full Access</div><div className="text-xs text-muted-foreground">{permsReady}/5 permissions</div></div>
            </button>
          </div>
        </section>

        <button
          onClick={() => navigate("/contacts")}
          className="w-full flex items-center justify-between p-4 bg-accent/40 border border-accent rounded-2xl text-left"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-secondary" />
            <div>
              <div className="font-semibold text-sm">Auto-SMS Ready</div>
              <div className="text-xs text-muted-foreground">
                {contactsCount > 0 ? `${contactsCount} contact${contactsCount > 1 ? "s" : ""} will be alerted` : "Add contacts to enable auto-alert"}
              </div>
            </div>
          </div>
          <span className="text-xs text-secondary font-semibold">Manage →</span>
        </button>

        {isResponder && (
          <div className="p-4 bg-gradient-trust rounded-2xl shadow-trust text-secondary-foreground">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-80">Responder access</p>
            <p className="text-sm mb-3">You have elevated access to incident dashboards.</p>
            <Button size="sm" variant="secondary" className="bg-background text-foreground" onClick={() => navigate("/responder")}>
              Open responder panel
            </Button>
            {roles.includes("admin") && (
              <Button size="sm" variant="secondary" className="bg-background text-foreground ml-2" onClick={() => navigate("/admin/volunteers")}>
                Verify volunteers
              </Button>
            )}
          </div>
        )}
      </main>

      {showFake && <FakeCall onEnd={() => setShowFake(false)} />}
      <BottomNav />
    </div>
  );
};

export default Dashboard;
