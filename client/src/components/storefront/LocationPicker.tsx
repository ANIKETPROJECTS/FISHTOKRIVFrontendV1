import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, MapPin, Check, Loader2, AlertCircle, CheckCircle2, Search } from "lucide-react";
import { useHub, SuperHub, SubHub } from "@/context/HubContext";
import { FishTokriLogo } from "@/components/storefront/FishTokriLogo";
import googleMapsIcon from "@assets/logo_(15)_1778186984164.png";

type GeoStatus = "idle" | "detecting" | "serviceable" | "unserviceable" | "denied" | "error";

const BRAND_BLUE = "#364F9F";
const BRAND_ORANGE = "#F97316";

/* ── Typewriter placeholder ─────────────────────────────────────────── */
const TYPEWRITER_PHRASES = [
  "Search area, locality, landmark...",
  "Try 'Thane', 'Bandra', 'Andheri'...",
  "Enter a pincode...",
  "Search by landmark...",
];

function useTypewriter(phrases: string[], speed = 60, pause = 1800) {
  const [displayed, setDisplayed] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && charIdx < current.length) {
      timeout = setTimeout(() => setCharIdx(c => c + 1), speed);
    } else if (!deleting && charIdx === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause);
    } else if (deleting && charIdx > 0) {
      timeout = setTimeout(() => setCharIdx(c => c - 1), speed / 2);
    } else if (deleting && charIdx === 0) {
      setDeleting(false);
      setPhraseIdx(p => (p + 1) % phrases.length);
    }

    setDisplayed(current.slice(0, charIdx));
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, phraseIdx, phrases, speed, pause]);

  return displayed;
}

/* ── Google Maps (loaded via index.html script tag) ─────────────────── */
declare global { interface Window { google: any } }

interface GooglePrediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

async function googlePlacesSearch(query: string): Promise<GooglePrediction[]> {
  if (!window.google?.maps?.places) return [];
  return new Promise((resolve) => {
    const svc = new window.google.maps.places.AutocompleteService();
    svc.getPlacePredictions(
      { input: query, componentRestrictions: { country: "in" }, types: ["geocode"] },
      (preds: GooglePrediction[] | null, status: string) => {
        if (status !== "OK" || !preds) { resolve([]); return; }
        resolve(preds);
      }
    );
  });
}

async function getPincodeFromPlaceId(placeId: string): Promise<string | null> {
  if (!window.google?.maps) return null;
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId }, (results: any, status: string) => {
      if (status !== "OK" || !results?.[0]) { resolve(null); return; }
      const comp = results[0].address_components.find((c: any) => c.types.includes("postal_code"));
      resolve(comp?.long_name ?? null);
    });
  });
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  if (!window.google?.maps) return null;
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng: lon } }, (results: any, status: string) => {
      if (status !== "OK" || !results?.[0]) { resolve(null); return; }
      const comp = results[0].address_components.find((c: any) => c.types.includes("postal_code"));
      resolve(comp?.long_name ?? null);
    });
  });
}

export function LocationPicker() {
  const { isPickerOpen, closePicker, setHub, selectedSuperHub, selectedSubHub } = useHub();
  const [step, setStep] = useState<"super" | "sub">("super");
  const [pickedSuper, setPickedSuper] = useState<SuperHub | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoMessage, setGeoMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GooglePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "serviceable" | "unserviceable">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const typewriterPlaceholder = useTypewriter(TYPEWRITER_PHRASES);

  const { data: superHubs = [], isLoading: loadingSuper } = useQuery<SuperHub[]>({
    queryKey: ["/api/hubs/super"],
    enabled: isPickerOpen,
  });

  const { data: subHubs = [], isLoading: loadingSub } = useQuery<SubHub[]>({
    queryKey: ["/api/hubs/sub", pickedSuper?.id],
    queryFn: async () => {
      const res = await fetch(`/api/hubs/sub?superHubId=${pickedSuper!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!pickedSuper,
  });

  const { data: allSubHubs = [] } = useQuery<SubHub[]>({
    queryKey: ["/api/hubs/sub-all"],
    queryFn: async () => {
      const res = await fetch("/api/hubs/sub", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isPickerOpen,
  });

  useEffect(() => {
    if (isPickerOpen) {
      setStep("super");
      setPickedSuper(selectedSuperHub);
      setGeoStatus("idle");
      setGeoMessage("");
      setSearchQuery("");
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchMessage("");
      setShowDropdown(false);
      setTimeout(() => searchInputRef.current?.focus(), 250);
    }
  }, [isPickerOpen]);

  /* Debounced Photon search */
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setShowDropdown(q.length > 0);
      return;
    }
    setIsSearching(true);
    setShowDropdown(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await googlePlacesSearch(q);
      setSearchResults(results);
      setIsSearching(false);
    }, 350);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  const checkServiceability = useCallback((
    pincode: string | undefined,
    locationName: string,
  ) => {
    if (pincode) {
      const clean = pincode.replace(/\s/g, "");
      const matchedSub = allSubHubs.find((sub) =>
        sub.pincodes.some((p) => p.replace(/\s/g, "") === clean)
      );
      if (matchedSub) {
        const matchedSuper = superHubs.find((s) => s.id === matchedSub.superHubId);
        if (matchedSuper) {
          setSearchStatus("serviceable");
          setSearchMessage(`We deliver to ${matchedSub.name}! (Pincode: ${clean})`);
          setTimeout(() => setHub(matchedSuper, matchedSub), 800);
          return true;
        }
      }
    }

    const pincodeInfo = pincode ? ` (${pincode.replace(/\s/g, "")})` : " — no pincode available";
    setSearchStatus("unserviceable");
    setSearchMessage(`Sorry, we don't deliver to ${locationName}${pincodeInfo} yet.`);
    return false;
  }, [allSubHubs, superHubs, setHub]);

  const handleSearchResultSelect = useCallback(async (prediction: GooglePrediction) => {
    const title = prediction.structured_formatting.main_text;
    setSearchQuery("");
    setShowDropdown(false);
    setSearchResults([]);
    setIsSearching(true);
    const pincode = await getPincodeFromPlaceId(prediction.place_id);
    setIsSearching(false);
    checkServiceability(pincode ?? undefined, title);
  }, [checkServiceability]);

  const handleDetectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoMessage("Your browser doesn't support location detection.");
      return;
    }
    setGeoStatus("detecting");
    setGeoMessage("Detecting your location...");
    setShowDropdown(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoMessage("Checking serviceability...");
        const pincode = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (!pincode) {
          setGeoStatus("error");
          setGeoMessage("Couldn't determine your area. Please select manually.");
          return;
        }
        const matchedSub = allSubHubs.find((sub) =>
          sub.pincodes.some((p) => p.replace(/\s/g, "") === pincode)
        );
        if (!matchedSub) {
          setGeoStatus("unserviceable");
          setGeoMessage(`Sorry, we don't deliver to your area yet (${pincode}).`);
          return;
        }
        const matchedSuper = superHubs.find((s) => s.id === matchedSub.superHubId);
        if (!matchedSuper) { setGeoStatus("error"); setGeoMessage("Couldn't match your location."); return; }
        setGeoStatus("serviceable");
        setGeoMessage(`Great news! We deliver to ${matchedSub.name}.`);
        setTimeout(() => setHub(matchedSuper, matchedSub), 1200);
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        setGeoMessage(err.code === err.PERMISSION_DENIED
          ? "Location access denied. Please allow it in your browser settings."
          : "Couldn't detect location. Please select manually.");
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, [allSubHubs, superHubs, setHub]);

  if (!isPickerOpen) return null;

  const handleSuperSelect = (hub: SuperHub) => { setPickedSuper(hub); setStep("sub"); };
  const handleSubSelect = (sub: SubHub) => { if (pickedSuper) setHub(pickedSuper, sub); };

  const geoConfigs = {
    detecting: { icon: <Loader2 className="w-4 h-4 animate-spin" />, bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
    serviceable: { icon: <CheckCircle2 className="w-4 h-4" />, bg: "bg-green-50 border-green-200", text: "text-green-700" },
    unserviceable: { icon: <AlertCircle className="w-4 h-4" />, bg: "bg-orange-50 border-orange-200", text: "text-orange-700" },
    denied: { icon: <AlertCircle className="w-4 h-4" />, bg: "bg-red-50 border-red-200", text: "text-red-700" },
    error: { icon: <AlertCircle className="w-4 h-4" />, bg: "bg-red-50 border-red-200", text: "text-red-700" },
  };
  const geoCfg = geoStatus !== "idle" ? geoConfigs[geoStatus as keyof typeof geoConfigs] : null;

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePicker} />

      {/* Main panel */}
      <div className="relative bg-white w-full h-full sm:max-w-md rounded-none border-l border-border/30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 max-h-screen font-[Poppins,sans-serif]">

        {/* Premium blue header */}
        <div className="shrink-0 bg-[#364F9F] px-5 pt-5 pb-5">
          {/* Top row: back button (if sub step) + close button */}
          <div className="flex items-center justify-between mb-4">
            <div>
              {step === "sub" && (
                <button
                  onClick={() => setStep("super")}
                  className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
                  data-testid="button-location-back"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
              )}
            </div>
            <button
              onClick={closePicker}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white transition-all duration-200"
              data-testid="button-location-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title left, pill right */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white leading-tight">
                {step === "sub" ? `Areas in ${pickedSuper?.name}` : "Select your location"}
              </h2>
              <p className="text-white/70 text-sm mt-0.5 font-normal">
                {step === "sub" ? "Pick your delivery area below" : "Search your area or detect automatically"}
              </p>
            </div>
            {/* Current location pill — orange bg, no icon, white text, right side */}
            {(selectedSubHub || selectedSuperHub) && (
              <div className="shrink-0 rounded-full px-5 py-2" style={{ backgroundColor: BRAND_ORANGE }}>
                <span className="text-base font-bold text-white">
                  {selectedSubHub ? selectedSubHub.name : selectedSuperHub?.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Search Box — pill format, darker style matching home screen */}
        <div className="px-5 pt-4 pb-2 shrink-0 relative" ref={dropdownRef}>
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin pointer-events-none" />
            ) : (
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            )}
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchStatus("idle"); setSearchMessage(""); }}
              onFocus={() => { setSearchFocused(true); searchQuery.trim().length >= 2 && setShowDropdown(true); }}
              onBlur={() => setSearchFocused(false)}
              placeholder={searchFocused ? "" : typewriterPlaceholder}
              className="w-full h-12 pl-10 pr-10 rounded-full border-2 bg-white text-sm font-normal text-slate-700 placeholder:text-slate-500 outline-none transition-all duration-200"
              style={{
                borderColor: searchFocused ? BRAND_BLUE : "#94a3b8",
                boxShadow: searchFocused ? `0 0 0 3px ${BRAND_BLUE}18` : "none",
              }}
              data-testid="input-location-search"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchStatus("idle"); setSearchMessage(""); setShowDropdown(false); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors"
              >
                <X className="w-3 h-3 text-slate-500" />
              </button>
            )}
          </div>

          {/* Search Dropdown */}
          {showDropdown && (
            <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-2xl border border-border/50 shadow-2xl z-20 overflow-hidden">
              <button
                onClick={() => { setShowDropdown(false); setSearchQuery(""); handleDetectLocation(); }}
                disabled={geoStatus === "detecting"}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50 transition-colors border-b border-border/30"
              >
                <div className="w-9 h-9 rounded-full bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                  <img src={googleMapsIcon} alt="Maps" className="w-7 h-7 object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Use current location</p>
                  <p className="text-xs text-slate-400 font-normal">Detect your area automatically</p>
                </div>
              </button>

              {isSearching ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Finding locations...</span>
                </div>
              ) : searchResults.length === 0 && searchQuery.trim().length >= 2 ? (
                <div className="px-4 py-3 text-sm text-slate-400 font-normal">No results found. Try a different term.</div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto">
                  {searchResults.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      onClick={() => handleSearchResultSelect(prediction)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors border-b border-border/10 last:border-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{prediction.structured_formatting.main_text}</p>
                        <p className="text-xs text-slate-400 font-normal truncate mt-0.5">{prediction.structured_formatting.secondary_text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search feedback banners */}
        {searchStatus === "serviceable" && (
          <div className="mx-5 mb-2 shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-green-500 text-white text-sm font-normal">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{searchMessage}</span>
          </div>
        )}
        {searchStatus === "unserviceable" && (
          <div className="mx-5 mb-2 shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm font-normal" style={{ backgroundColor: BRAND_ORANGE }}>
            <AlertCircle className="w-4 h-4 shrink-0 text-white" />
            <span>{searchMessage}</span>
          </div>
        )}

        {/* Use current location — no card, no bg circle, bigger icon + text */}
        <div className="px-5 pb-2 shrink-0">
          <button
            onClick={handleDetectLocation}
            disabled={geoStatus === "detecting" || geoStatus === "serviceable"}
            data-testid="button-detect-location"
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {geoStatus === "detecting" ? (
              <Loader2 className="w-12 h-12 animate-spin shrink-0" style={{ color: BRAND_BLUE }} />
            ) : (
              <img src={googleMapsIcon} alt="Maps" className="w-12 h-12 object-contain shrink-0" />
            )}
            <div className="text-left">
              <p className="text-lg font-bold text-slate-800 leading-tight">
                {geoStatus === "detecting" ? "Detecting location..." : "Use current location"}
              </p>
              <p className="text-base text-slate-500 font-normal mt-0.5">Auto-detect & check serviceability</p>
            </div>
          </button>
        </div>

        {/* Geo Status Banner */}
        {geoCfg && geoStatus !== "unserviceable" && geoStatus !== "denied" && geoStatus !== "error" && (
          <div className={`mx-5 mb-2 shrink-0 flex items-center gap-2 p-3 rounded-xl border text-sm font-normal ${geoCfg.bg} ${geoCfg.text}`}>
            {geoCfg.icon}
            <span>{geoMessage}</span>
          </div>
        )}
        {geoCfg && (geoStatus === "unserviceable" || geoStatus === "denied" || geoStatus === "error") && (
          <div className="mx-5 mb-2 shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm font-normal" style={{ backgroundColor: BRAND_ORANGE }}>
            <AlertCircle className="w-4 h-4 shrink-0 text-white" />
            <span>{geoMessage}</span>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 px-5 mb-3 shrink-0">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-normal tracking-wide">or select manually</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Scrollable hub list */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0">
          {step === "super" ? (
            loadingSuper ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : superHubs.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm font-normal">No cities available</p>
            ) : (
              <div className="space-y-3">
                {superHubs.map(hub => {
                  const isSelected = selectedSuperHub?.id === hub.id;
                  return (
                    <button
                      key={hub.id}
                      onClick={() => handleSuperSelect(hub)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left bg-white ${
                        isSelected
                          ? "border-[#364F9F]/40 shadow-sm"
                          : "border-slate-200 hover:border-[#364F9F]/30 hover:bg-slate-50"
                      }`}
                      data-testid={`button-super-hub-${hub.id}`}
                    >
                      {hub.imageUrl ? (
                        <img src={hub.imageUrl} alt={hub.name} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-sm" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <MapPin className="w-7 h-7 text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-lg">{hub.name}</p>
                        {hub.location && <p className="text-base text-slate-500 font-normal truncate mt-0.5">{hub.location}</p>}
                      </div>
                      {isSelected && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: BRAND_BLUE }}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            loadingSub ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : subHubs.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm font-normal">No areas available yet</p>
            ) : (
              <div className="space-y-2.5">
                {subHubs.map(sub => {
                  const isSelected = selectedSubHub?.id === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => handleSubSelect(sub)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left bg-white ${
                        isSelected
                          ? "border-[#364F9F]/40 shadow-sm"
                          : "border-slate-200 hover:border-[#364F9F]/30 hover:bg-slate-50"
                      }`}
                      data-testid={`button-sub-hub-${sub.id}`}
                    >
                      {sub.imageUrl ? (
                        <img src={sub.imageUrl} alt={sub.name} className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-sm" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <MapPin className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-lg">{sub.name}</p>
                        {sub.location && <p className="text-base text-slate-500 font-normal truncate mt-0.5">{sub.location}</p>}
                      </div>
                      {isSelected && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: BRAND_BLUE }}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
