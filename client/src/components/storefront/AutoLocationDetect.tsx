import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin, Navigation, Loader2, CheckCircle2, AlertCircle, Phone, MessageCircle, X
} from "lucide-react";
import { useHub, SuperHub, SubHub } from "@/context/HubContext";
import { waitForMapsReady } from "@/hooks/use-google-maps";

declare global { interface Window { google: any } }

const STORAGE_KEY = "fishtokri_hub";
const DISMISSED_KEY = "fishtokri_location_dismissed";
const BRAND_BLUE = "#364F9F";
const BRAND_ORANGE = "#F97316";

// ── Update to your actual business contact numbers ─────────────────────
const BUSINESS_PHONE = "9220200100";
const BUSINESS_WHATSAPP = "919220200100"; // 91 + 10-digit number, no +
// ──────────────────────────────────────────────────────────────────────

type Phase = "idle" | "permission" | "detecting" | "serviceable" | "unserviceable" | "done";

async function reverseGeocodeCoords(lat: number, lon: number): Promise<string | null> {
  const ready = await waitForMapsReady(8000);
  if (!ready || !window.google?.maps) return null;
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat, lng: lon } },
      (results: any, status: string) => {
        if (status !== "OK" || !results?.[0]) { resolve(null); return; }
        const comp = results[0].address_components.find(
          (c: any) => c.types.includes("postal_code")
        );
        resolve(comp?.long_name ?? null);
      }
    );
  });
}

async function getIpPincode(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.postal ?? null;
  } catch {
    return null;
  }
}

export function AutoLocationDetect() {
  const { setHub } = useHub();

  const setHubRef = useRef(setHub);
  setHubRef.current = setHub;
  const subsRef = useRef<SubHub[]>([]);
  const supersRef = useRef<SuperHub[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [detectedArea, setDetectedArea] = useState("");

  const matchPincode = useCallback((pincode: string): boolean => {
    const clean = pincode.replace(/\s/g, "");
    const sub = subsRef.current.find((s) =>
      s.pincodes.some((p) => p.pincode.replace(/\s/g, "") === clean)
    );
    if (!sub) return false;
    const sup = supersRef.current.find((s) => s.id === sub.superHubId);
    if (!sup) return false;
    setHubRef.current(sup, sub);
    setDetectedArea(sub.name);
    return true;
  }, []);

  const runDetect = useCallback(async () => {
    return new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        // No GPS — try IP only
        getIpPincode().then((ipPin) => {
          if (ipPin && matchPincode(ipPin)) {
            setPhase("serviceable");
            setTimeout(() => setPhase("done"), 3500);
          } else {
            setPhase("unserviceable");
          }
          resolve();
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const pincode = await reverseGeocodeCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          if (pincode && matchPincode(pincode)) {
            setPhase("serviceable");
            setTimeout(() => setPhase("done"), 3500);
          } else {
            // GPS gave coords but pincode didn't match or geocode failed — try IP
            const ipPin = await getIpPincode();
            if (ipPin && matchPincode(ipPin)) {
              setPhase("serviceable");
              setTimeout(() => setPhase("done"), 3500);
            } else {
              setPhase("unserviceable");
            }
          }
          resolve();
        },
        async () => {
          // GPS denied or errored — IP fallback
          const ipPin = await getIpPincode();
          if (ipPin && matchPincode(ipPin)) {
            setPhase("serviceable");
            setTimeout(() => setPhase("done"), 3500);
          } else {
            setPhase("unserviceable");
          }
          resolve();
        },
        { timeout: 12000, maximumAge: 300000 }
      );
    });
  }, [matchPincode]);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    let cancelled = false;

    const init = async () => {
      try {
        const [superRes, subRes] = await Promise.all([
          fetch("/api/hubs/super"),
          fetch("/api/hubs/sub"),
        ]);
        if (!superRes.ok || !subRes.ok || cancelled) return;
        supersRef.current = await superRes.json();
        subsRef.current = await subRes.json();

        if (!subsRef.current.length || cancelled) return;

        if (navigator.permissions) {
          const perm = await navigator.permissions.query({ name: "geolocation" });
          if (cancelled) return;
          if (perm.state === "granted") {
            setPhase("detecting");
            await runDetect();
          } else {
            // Show the modal after a brief delay so the page settles first
            setTimeout(() => {
              if (!cancelled) setPhase("permission");
            }, 1400);
          }
        } else {
          setTimeout(() => {
            if (!cancelled) setPhase("permission");
          }, 1400);
        }
      } catch { /* network error — stay hidden */ }
    };

    init();
    return () => { cancelled = true; };
  }, [runDetect]);

  const handleAllow = useCallback(async () => {
    setPhase("detecting");
    await runDetect();
  }, [runDetect]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setPhase("done");
  }, []);

  const { openPicker } = useHub();
  const handleManualSelect = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setPhase("done");
    openPicker();
  }, [openPicker]);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center px-0 sm:px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === "permission" || phase === "unserviceable" ? handleDismiss : undefined}
      />

      {/* Modal card */}
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Dismiss button */}
        {(phase === "permission" || phase === "unserviceable") && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
            data-testid="button-location-modal-dismiss"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        )}

        {/* ── DETECTING STATE ─────────────────────────────────────── */}
        {phase === "detecting" && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${BRAND_BLUE}15` }}
            >
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_BLUE }} />
            </div>
            <p className="text-lg font-bold text-slate-800">Detecting your location</p>
            <p className="text-sm text-slate-500 mt-1">Checking if we deliver to your area...</p>
          </div>
        )}

        {/* ── PERMISSION REQUEST STATE ─────────────────────────────── */}
        {phase === "permission" && (
          <div className="flex flex-col items-center px-8 py-8 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${BRAND_BLUE}15` }}
            >
              <Navigation className="w-8 h-8" style={{ color: BRAND_BLUE }} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Check delivery availability
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Allow location access so we can instantly check if we deliver fresh seafood &amp; meat to your area.
            </p>
            <button
              onClick={handleAllow}
              className="w-full h-12 rounded-2xl text-white font-bold text-base mb-3 transition-opacity hover:opacity-90 active:opacity-80"
              style={{ backgroundColor: BRAND_BLUE }}
              data-testid="button-allow-location"
            >
              Allow location access
            </button>
            <button
              onClick={handleManualSelect}
              className="w-full h-11 rounded-2xl text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              data-testid="button-select-manually"
            >
              Select my city manually
            </button>
          </div>
        )}

        {/* ── SERVICEABLE STATE ────────────────────────────────────── */}
        {phase === "serviceable" && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">
              We deliver to you!
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Fresh seafood &amp; meat delivered to{" "}
              <span className="font-semibold" style={{ color: BRAND_BLUE }}>
                {detectedArea}
              </span>
            </p>
            <div className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: BRAND_ORANGE }}>
              <MapPin className="w-4 h-4" />
              {detectedArea} — Location set!
            </div>
          </div>
        )}

        {/* ── UNSERVICEABLE STATE ──────────────────────────────────── */}
        {phase === "unserviceable" && (
          <div className="flex flex-col items-center px-8 py-8 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${BRAND_ORANGE}15` }}
            >
              <AlertCircle className="w-8 h-8" style={{ color: BRAND_ORANGE }} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              We're not in your area yet
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-1">
              Sorry, we don't deliver to your location at the moment.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              For <span className="font-semibold text-slate-700">bulk or long-distance orders</span>, reach out to us directly — we'll do our best to help!
            </p>

            <div className="flex gap-3 w-full mb-3">
              <a
                href={`tel:${BUSINESS_PHONE}`}
                className="flex-1 h-12 rounded-2xl border-2 flex items-center justify-center gap-2 text-sm font-bold transition-colors hover:opacity-90"
                style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE }}
                data-testid="button-call-us"
              >
                <Phone className="w-4 h-4" />
                Call Us
              </a>
              <a
                href={`https://wa.me/${BUSINESS_WHATSAPP}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#25D366" }}
                data-testid="button-whatsapp-us"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </div>

            <button
              onClick={handleManualSelect}
              className="w-full h-11 rounded-2xl text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors border border-slate-200 hover:border-slate-300"
              data-testid="button-select-area-manually"
            >
              Select delivery area manually
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
