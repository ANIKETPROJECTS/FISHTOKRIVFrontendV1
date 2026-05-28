import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useHub, SuperHub, SubHub } from "@/context/HubContext";
import scooterImg from "@assets/animation-original_(50)_1779948531895.png";

const BRAND_BLUE = "#364F9F";

type CheckStatus = "idle" | "checking" | "eligible" | "ineligible";

export function LocationPicker() {
  const { isPickerOpen, closePicker, setHub } = useHub();

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [areaName, setAreaName] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pincode = digits.join("");

  const { data: allSubHubs = [] } = useQuery<SubHub[]>({
    queryKey: ["/api/hubs/sub-all"],
    queryFn: async () => {
      const res = await fetch("/api/hubs/sub", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isPickerOpen,
  });

  const { data: superHubs = [] } = useQuery<SuperHub[]>({
    queryKey: ["/api/hubs/super"],
    enabled: isPickerOpen,
  });

  const reset = useCallback(() => {
    setDigits(["", "", "", "", "", ""]);
    setStatus("idle");
    setAreaName("");
    setTimeout(() => inputRefs.current[0]?.focus(), 150);
  }, []);

  const handleCheck = useCallback(() => {
    const clean = pincode.replace(/\s/g, "");
    if (clean.length !== 6) return;
    setStatus("checking");

    const matchedSub = allSubHubs.find((sub) =>
      sub.pincodes.some((p) => p.pincode.replace(/\s/g, "") === clean)
    );

    setTimeout(() => {
      if (matchedSub) {
        const matchedSuper = superHubs.find((s) => s.id === matchedSub.superHubId);
        if (matchedSuper) {
          setAreaName(matchedSub.name);
          setStatus("eligible");
          setHub(matchedSuper, matchedSub);
          setTimeout(() => { closePicker(); reset(); }, 2000);
          return;
        }
      }
      setStatus("ineligible");
    }, 600);
  }, [pincode, allSubHubs, superHubs, setHub, closePicker, reset]);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (status !== "idle") setStatus("idle");
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (digit && index === 5) {
      const full = newDigits.join("");
      if (full.length === 6) setTimeout(handleCheck, 50);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = "";
        setDigits(newDigits);
        if (status !== "idle") setStatus("idle");
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === "Enter" && pincode.length === 6) handleCheck();
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...pasted.split(""), ...Array(6 - pasted.length).fill("")].slice(0, 6);
      setDigits(newDigits);
      if (status !== "idle") setStatus("idle");
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
    e.preventDefault();
  };

  const handleClose = () => {
    closePicker();
    reset();
  };

  if (!isPickerOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 fade-in duration-200">

        {/* Scooter image — no header bar */}
        <div className="flex justify-center pt-7 pb-2 px-6">
          <img
            src={scooterImg}
            alt="Delivery"
            className="w-36 h-auto object-contain"
          />
        </div>

        {/* Text */}
        <div className="px-7 pb-2 text-center">
          <h2 className="text-lg font-semibold text-slate-800 mb-1" style={{ fontWeight: 500 }}>
            Check Delivery
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed font-normal">
            Enter your pincode to see if we deliver to your area
          </p>
        </div>

        {/* 6-box pincode input */}
        <div className="px-7 py-4">
          <div className="flex items-center justify-center gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                autoFocus={i === 0}
                className="w-10 h-12 text-center text-lg font-semibold rounded-xl border-2 outline-none transition-all duration-150 text-slate-800"
                style={{
                  borderColor:
                    status === "eligible"
                      ? "#22c55e"
                      : status === "ineligible"
                      ? "#ef4444"
                      : digit
                      ? BRAND_BLUE
                      : "#e2e8f0",
                  boxShadow: digit ? `0 0 0 2px ${BRAND_BLUE}20` : "none",
                  fontFamily: "'Poppins', sans-serif",
                }}
                data-testid={`input-pincode-${i}`}
              />
            ))}
          </div>

          {/* Status messages */}
          {status === "eligible" && (
            <div className="flex items-center justify-center gap-2 mt-3 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-700" style={{ fontWeight: 500 }}>
                We deliver to <span className="font-semibold">{areaName}</span>!
              </p>
            </div>
          )}

          {status === "ineligible" && (
            <div className="flex items-center justify-center gap-2 mt-3 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm font-medium text-slate-600" style={{ fontWeight: 400 }}>
                Sorry, we don't deliver to <span className="font-semibold">{pincode}</span> yet.
              </p>
            </div>
          )}
        </div>

        {/* Check Availability button */}
        <div className="px-7 pb-7">
          <button
            onClick={handleCheck}
            disabled={pincode.length !== 6 || status === "checking"}
            className="w-full h-12 rounded-full text-white text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: BRAND_BLUE, fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
            data-testid="button-check-pincode"
          >
            {status === "checking" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking...
              </>
            ) : (
              "Check Availability"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
