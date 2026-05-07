import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, MapPin, Check, Navigation, Loader2, AlertCircle, CheckCircle2, Search } from "lucide-react";
import { useHub, SuperHub, SubHub } from "@/context/HubContext";

type GeoStatus = "idle" | "detecting" | "serviceable" | "unserviceable" | "denied" | "error";

/* ── Photon (Komoot) for forward search ─────────────────────────────── */
interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    osm_id?: number;
    name?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
    type?: string;
  };
}

async function photonSearch(query: string): Promise<PhotonFeature[]> {
  try {
    // India bounding box  lon_min,lat_min,lon_max,lat_max
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en&bbox=68.7,8.4,97.3,37.1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Filter to India only
    return (data.features ?? []).filter(
      (f: PhotonFeature) => f.properties.country === "India" || !f.properties.country
    );
  } catch {
    return [];
  }
}

function photonTitle(f: PhotonFeature): string {
  const p = f.properties;
  return p.name || p.locality || p.district || p.city || "";
}

function photonSubtitle(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.locality && p.locality !== photonTitle(f)) parts.push(p.locality);
  if (p.district && p.district !== photonTitle(f)) parts.push(p.district);
  if (p.city && p.city !== photonTitle(f)) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.country) parts.push(p.country);
  return parts.slice(0, 4).join(", ");
}

/* ── Nominatim reverse geocode for GPS ─────────────────────────────── */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.address?.postcode?.replace(/\s/g, "") ?? null;
  } catch {
    return null;
  }
}

export function LocationPicker() {
  const { isPickerOpen, closePicker, setHub, selectedSuperHub, selectedSubHub } = useHub();
  const [step, setStep] = useState<"super" | "sub">("super");
  const [pickedSuper, setPickedSuper] = useState<SuperHub | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoMessage, setGeoMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PhotonFeature[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "serviceable" | "unserviceable">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      const results = await photonSearch(q);
      setSearchResults(results);
      setIsSearching(false);
    }, 350);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  /* Check serviceability for a selected Photon feature.
     Only exact pincode match against sub hub pincode lists is used. */
  const checkServiceability = useCallback((
    pincode: string | undefined,
    locationName: string,
    _feature?: PhotonFeature
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

  const handleSearchResultSelect = useCallback((feature: PhotonFeature) => {
    const title = photonTitle(feature);
    setSearchQuery("");
    setShowDropdown(false);
    setSearchResults([]);
    setIsSearching(false);
    checkServiceability(feature.properties.postcode, title, feature);
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

      {/* Main panel — slide-in from right on both mobile and desktop, like the cart */}
      <div className="relative bg-white w-full h-full sm:max-w-md rounded-none border-l border-border/30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 max-h-screen">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-border/30 shrink-0">
          {step === "sub" && (
            <button onClick={() => setStep("super")} className="p-1.5 rounded-full hover:bg-muted transition-colors mt-0.5" data-testid="button-location-back">
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-foreground leading-tight">Select a location</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Search your area or use current location</p>
            <div className="flex items-center gap-1.5 mt-2 text-primary">
              <MapPin className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">
                {selectedSubHub ? selectedSubHub.name : selectedSuperHub ? selectedSuperHub.name : "No area selected"}
              </span>
            </div>
          </div>
          <button onClick={closePicker} className="flex items-center justify-center w-9 h-9 rounded-full bg-[#364F9F] text-white transition-all duration-200 hover:bg-[#2a3d7a] shadow-md mt-0.5" data-testid="button-location-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Box */}
        <div className="px-5 pt-4 pb-2 shrink-0 relative" ref={dropdownRef}>
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin pointer-events-none" />
            ) : (
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            )}
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchStatus("idle"); setSearchMessage(""); }}
              onFocus={() => searchQuery.trim().length >= 2 && setShowDropdown(true)}
              placeholder="Search area, locality, landmark, pincode..."
              className="w-full h-12 pl-10 pr-10 rounded-2xl border-2 border-border/60 focus:border-primary/60 bg-slate-50 focus:bg-white text-sm font-medium placeholder:text-muted-foreground/60 outline-none transition-all"
              data-testid="input-location-search"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchStatus("idle"); setSearchMessage(""); setShowDropdown(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center hover:bg-muted-foreground/30 transition-colors"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Search Dropdown — floats above the content */}
          {showDropdown && (
            <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-2xl border border-border/50 shadow-2xl z-20 overflow-hidden">
              {/* Use current location — always top of dropdown */}
              <button
                onClick={() => { setShowDropdown(false); setSearchQuery(""); handleDetectLocation(); }}
                disabled={geoStatus === "detecting"}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-primary/5 transition-colors border-b border-border/30"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Navigation className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">Use current location</p>
                  <p className="text-xs text-muted-foreground">Detect your area automatically</p>
                </div>
              </button>

              {/* Search results */}
              {isSearching ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Finding locations...</span>
                </div>
              ) : searchResults.length === 0 && searchQuery.trim().length >= 2 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No results found. Try a different term.</div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto">
                  {searchResults.map((feature, i) => {
                    const title = photonTitle(feature);
                    const subtitle = photonSubtitle(feature);
                    const postcode = feature.properties.postcode;
                    return (
                      <button
                        key={`${feature.properties.osm_id ?? i}`}
                        onClick={() => handleSearchResultSelect(feature)}
                        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors border-b border-border/10 last:border-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
                          {postcode && (
                            <p className="text-[11px] text-primary/70 font-medium mt-0.5">Pincode: {postcode}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search feedback banners */}
        {searchStatus === "serviceable" && (
          <div className="mx-5 mb-2 shrink-0 flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{searchMessage}</span>
          </div>
        )}
        {searchStatus === "unserviceable" && (
          <div className="mx-5 mb-2 shrink-0 flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchMessage}</span>
          </div>
        )}

        {/* Use current location — persistent button */}
        <div className="px-5 pb-2 shrink-0">
          <button
            onClick={handleDetectLocation}
            disabled={geoStatus === "detecting" || geoStatus === "serviceable"}
            data-testid="button-detect-location"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {geoStatus === "detecting" ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            ) : (
              <Navigation className="w-5 h-5 text-primary shrink-0" />
            )}
            <div className="text-left">
              <p className="text-sm font-semibold text-primary leading-tight">
                {geoStatus === "detecting" ? "Detecting location..." : "Use current location"}
              </p>
              <p className="text-xs text-muted-foreground">Auto-detect & check serviceability</p>
            </div>
          </button>
        </div>

        {/* Geo Status Banner */}
        {geoCfg && (
          <div className={`mx-5 mb-2 shrink-0 flex items-center gap-2 p-3 rounded-xl border text-sm ${geoCfg.bg} ${geoCfg.text}`}>
            {geoCfg.icon}
            <span>{geoMessage}</span>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 px-5 mb-2 shrink-0">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-xs text-muted-foreground font-medium">or select manually</span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        {/* Scrollable hub list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
          {step === "super" ? (
            loadingSuper ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-muted/50 animate-pulse" />)}
              </div>
            ) : superHubs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No cities available</p>
            ) : (
              <div className="space-y-2.5">
                {superHubs.map(hub => (
                  <button
                    key={hub.id}
                    onClick={() => handleSuperSelect(hub)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedSuperHub?.id === hub.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 hover:border-primary/30 hover:bg-muted/40"
                    }`}
                    data-testid={`button-super-hub-${hub.id}`}
                  >
                    {hub.imageUrl ? (
                      <img src={hub.imageUrl} alt={hub.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{hub.name}</p>
                      {hub.location && <p className="text-xs text-muted-foreground truncate mt-0.5">{hub.location}</p>}
                    </div>
                    {selectedSuperHub?.id === hub.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )
          ) : (
            loadingSub ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-2xl bg-muted/50 animate-pulse" />)}
              </div>
            ) : subHubs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No areas available yet</p>
            ) : (
              <div className="space-y-2">
                {subHubs.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => handleSubSelect(sub)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedSubHub?.id === sub.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 hover:border-primary/30 hover:bg-muted/40"
                    }`}
                    data-testid={`button-sub-hub-${sub.id}`}
                  >
                    {sub.imageUrl ? (
                      <img src={sub.imageUrl} alt={sub.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{sub.name}</p>
                      {sub.location && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub.location}</p>}
                      {sub.pincodes?.length > 0 && (
                        <p className="text-xs text-primary/60 font-medium mt-0.5">
                          Pincodes: {sub.pincodes.slice(0, 4).join(", ")}{sub.pincodes.length > 4 ? "..." : ""}
                        </p>
                      )}
                    </div>
                    {selectedSubHub?.id === sub.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
