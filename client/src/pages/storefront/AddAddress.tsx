import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { SavedAddress } from "@/components/storefront/CartDrawer";
import { ChevronLeft, Home, Briefcase, Tag, MapPin, X, Loader2 } from "lucide-react";

declare global { interface Window { google: any } }

const TYPE_OPTIONS = [
  { value: "house" as const, icon: <Home className="w-3.5 h-3.5" />, label: "House" },
  { value: "office" as const, icon: <Briefcase className="w-3.5 h-3.5" />, label: "Office" },
  { value: "other" as const, icon: <Tag className="w-3.5 h-3.5" />, label: "Other" },
];

const emptyForm = {
  name: "", phone: "", building: "", street: "", area: "",
  pincode: "", type: "house" as "house" | "office" | "other",
  label: "", instructions: "",
};

function GoogleMapPicker({ onConfirm, onClose }: {
  onConfirm: (area: string, pincode: string) => void;
  onClose: () => void;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [pickedArea, setPickedArea] = useState("");
  const [pickedPincode, setPickedPincode] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.google?.maps) { setMapsReady(true); return true; }
      return false;
    };
    if (!check()) {
      const t = setInterval(() => { if (check()) clearInterval(t); }, 300);
      return () => clearInterval(t);
    }
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || mapRef.current) return;

    const center = { lat: 19.076, lng: 72.8777 };
    const map = new window.google.maps.Map(mapDivRef.current, {
      center,
      zoom: 13,
      gestureHandling: "greedy",
      disableDefaultUI: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    const marker = new window.google.maps.Marker({
      position: center,
      map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      title: "Drag to your delivery location",
    });
    markerRef.current = marker;

    const geocodePos = (pos: { lat: number; lng: number }) => {
      setIsGeocoding(true);
      new window.google.maps.Geocoder().geocode({ location: pos }, (results: any, status: string) => {
        setIsGeocoding(false);
        if (status !== "OK" || !results?.[0]) return;
        const comps = results[0].address_components;
        const postal = comps.find((c: any) => c.types.includes("postal_code"))?.long_name ?? "";
        const sub = comps.find((c: any) =>
          c.types.includes("sublocality_level_1") || c.types.includes("sublocality")
        )?.long_name;
        const locality = comps.find((c: any) => c.types.includes("locality"))?.long_name;
        setPickedArea(sub || locality || "");
        setPickedPincode(postal);
      });
    };

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      geocodePos({ lat: pos.lat(), lng: pos.lng() });
    });

    geocodePos(center);
  }, [mapsReady]);

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b shrink-0">
          <div>
            <p className="font-bold text-foreground text-base">Pin your delivery location</p>
            <p className="text-xs text-muted-foreground mt-0.5">Drag the pin to your exact address</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {!mapsReady ? (
          <div className="h-[50vh] flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading map...</p>
            </div>
          </div>
        ) : (
          <div ref={mapDivRef} className="w-full h-[50vh]" />
        )}

        <div className="px-5 py-4 border-t bg-slate-50 shrink-0">
          {isGeocoding ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Fetching address details...</span>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {pickedArea ? (
                  <>
                    <p className="text-sm font-semibold text-foreground truncate">{pickedArea}</p>
                    {pickedPincode && (
                      <p className="text-xs text-muted-foreground mt-0.5">Pincode: {pickedPincode}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Drag the pin to your location</p>
                )}
              </div>
              <Button
                onClick={() => { if (pickedArea || pickedPincode) onConfirm(pickedArea, pickedPincode); }}
                disabled={!pickedArea && !pickedPincode}
                className="rounded-xl shrink-0 font-semibold"
                size="sm"
              >
                Use this location
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AddAddress() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState(emptyForm);
  const [useAccountDetails, setUseAccountDetails] = useState(false);
  const [profileData, setProfileData] = useState<{ name: string; phone: string } | null>(null);
  const [instructionLen, setInstructionLen] = useState(0);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const profile = localStorage.getItem("fishtokri_profile");
    if (profile) {
      const p = JSON.parse(profile);
      setProfileData({ name: p.name || "", phone: p.phone || "" });
    }
  }, []);

  const handleUseAccount = (v: boolean) => {
    setUseAccountDetails(v);
    if (v && profileData) {
      setForm(f => ({ ...f, name: profileData.name, phone: profileData.phone }));
    }
  };

  const handleMapConfirm = (area: string, pincode: string) => {
    setForm(f => ({ ...f, area: area || f.area, pincode: pincode || f.pincode }));
    setShowMap(false);
    toast({ title: "Location set!", description: `${area}${pincode ? ` · ${pincode}` : ""}` });
  };

  const save = () => {
    if (!form.name || !form.phone || !form.building || !form.area) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const label =
      form.type === "other" ? (form.label || "Other") :
      form.type === "house" ? "Home" : "Office";
    const newAddr: SavedAddress = { ...form, label, id: Date.now().toString() };
    const existing: SavedAddress[] = JSON.parse(localStorage.getItem("fishtokri_addresses") || "[]");
    localStorage.setItem("fishtokri_addresses", JSON.stringify([...existing, newAddr]));
    toast({ title: "Address saved!" });
    navigate(-1 as any);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      {showMap && (
        <GoogleMapPicker
          onConfirm={handleMapConfirm}
          onClose={() => setShowMap(false)}
        />
      )}

      <div className="sticky top-0 z-50 bg-white border-b border-border/30 px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1 as any)} className="rounded-full border border-border/40">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Add Delivery Address</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {profileData?.name && (
          <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-4 border border-border/40">
            <Checkbox id="use-account" checked={useAccountDetails} onCheckedChange={v => handleUseAccount(!!v)} className="mt-0.5" />
            <div>
              <label htmlFor="use-account" className="text-sm font-semibold text-foreground cursor-pointer block">Use my account details</label>
              <p className="text-xs text-muted-foreground mt-0.5">{profileData.name}, {profileData.phone}</p>
            </div>
          </div>
        )}

        {!useAccountDetails && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Recipient name" className="rounded-xl h-12 border-border/60 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone *</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile number" className="rounded-xl h-12 border-border/60 text-base" type="tel" />
            </div>
          </div>
        )}

        {/* Google Maps live pin */}
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="w-full rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 flex items-center gap-4 hover:bg-primary/10 transition-colors text-left"
          data-testid="button-open-map"
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            {form.area ? (
              <>
                <p className="text-sm font-semibold text-foreground">{form.area}{form.pincode ? ` · ${form.pincode}` : ""}</p>
                <p className="text-xs text-primary mt-0.5 font-medium">Tap to change location on map</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Set your location on map</p>
                <p className="text-xs text-muted-foreground mt-0.5">Tap to pin your exact delivery location</p>
              </>
            )}
          </div>
          <span className="text-xs font-semibold text-primary border border-primary/40 rounded-xl px-3 py-1.5 shrink-0">
            {form.area ? "Change" : "Open Map"}
          </span>
        </button>

        <div className="space-y-4">
          <h2 className="text-base font-bold text-foreground">Location Details</h2>

          <div className="flex gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  form.type === opt.value ? "bg-foreground text-white border-foreground" : "bg-white text-muted-foreground border-border/50 hover:border-foreground/30"
                }`}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Building / Floor *</Label>
            <Input value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} placeholder="e.g. Kairali Park, Wing A, Floor 3" className="rounded-xl h-12 border-border/60 text-base" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Street <span className="normal-case font-normal text-muted-foreground/60">(Recommended)</span>
            </Label>
            <Input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} placeholder="e.g. 205, MG Road" className="rounded-xl h-12 border-border/60 text-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Area *</Label>
              <Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="e.g. Thane West" className="rounded-xl h-12 border-border/60 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pincode *</Label>
              <Input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} placeholder="400001" type="tel" maxLength={6} className="rounded-xl h-12 border-border/60 text-base" />
            </div>
          </div>

          {form.type === "other" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Save Address As *</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Room, Gym, Parents Home" className="rounded-xl h-12 border-border/60 text-base" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">Delivery Instructions</h2>
          <Textarea
            value={form.instructions}
            onChange={e => { setForm(f => ({ ...f, instructions: e.target.value })); setInstructionLen(e.target.value.length); }}
            placeholder="e.g. Take the first left near the red gate, ring the bell twice"
            className="rounded-xl border-border/60 resize-none min-h-[80px] text-base"
            maxLength={100}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Example: Take the first left next to red gate</p>
            <p className="text-xs text-muted-foreground">{instructionLen}/100</p>
          </div>
        </div>

        <Button onClick={save} className="w-full h-14 rounded-2xl font-bold text-base bg-primary text-white shadow-lg shadow-primary/20 mt-4">
          Save Address
        </Button>
      </div>
    </div>
  );
}
