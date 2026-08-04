import { declareComponent } from "@webflow/react";
import { props } from "@webflow/data-types";
import {
  useState, useRef, useCallback, useEffect, useMemo,
  useReducer, Component, type ReactNode, type ErrorInfo
} from "react";
import { useWebflowContext } from "@webflow/react";

/* ═══ ERROR BOUNDARY ═══ */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(p: any) {
    super(p);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CardConfigurator error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "24px", fontFamily: "sans-serif", color: "#c44", backgroundColor: "#fff5f5", borderRadius: "8px", margin: "16px" }}>
          <p style={{ fontWeight: 700, margin: "0 0 8px 0" }}>Card Configurator — Fout</p>
          <p style={{ margin: 0, fontSize: "13px" }}>{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false, error: "" })} style={{ marginTop: "12px", padding: "6px 16px", border: "1px solid #c44", borderRadius: "6px", backgroundColor: "transparent", color: "#c44", cursor: "pointer", fontSize: "13px" }}>
            Opnieuw proberen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══ CONSTANTS ═══ */
const A5_W = 210, A5_H = 148;
const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const BLEED_MM = 3;
const BLEED = Math.round(BLEED_MM * MM_TO_PX);

const FRONT_W = Math.round(A5_W * MM_TO_PX);
const FRONT_H = Math.round(A5_H * MM_TO_PX);
const FRONT_BW = FRONT_W + BLEED * 2;
const FRONT_BH = FRONT_H + BLEED * 2;

const BANNER_PCT = 30;
const CROP_LEN = 60;
const CROP_GAP = 6;
const SAFE_ZONE_MM = 5;

const STORAGE_KEY = "card-configurator-state";
const IDB_NAME = "card-configurator-db";
const IDB_STORE = "state";
const IDB_VERSION = 1;

const A4_W = 210, A4_H = 297;
const INSIDE_W = Math.round(A4_W * MM_TO_PX);
const INSIDE_H = Math.round(A4_H * MM_TO_PX);
const INSIDE_BW = INSIDE_W + BLEED * 2;
const INSIDE_BH = INSIDE_H + BLEED * 2;
const INSIDE_BG_URL = "https://cdn.prod.website-files.com/64197cc780f7efa648ffa7c8/6a15b41f7142dfa2cc57fa73_6520e9fe2f95592fc083d527194678da_Kaart_Envelop%20Template-%20individueel-2025-binnen-leeg.jpg";

const DEFAULT_INSIDE_HTML = `<b>Beste [naam],</b><br><br><b>Met de feestdagen voor de deur willen we graag terugblikken op dit jaar. We weten dat het niet altijd makkelijk is geweest en willen jouw inzet niet voor lief nemen. Zeker in deze tijd, waarin we goed personeel en mensen die hart voor de zaak hebben steeds meer gaan waarderen, vinden we het belangrijk om dit ook daadwerkelijk naar jou te uiten.</b><br><br>Het afgelopen jaar hebben we weer als team maar ook zeker jij als individu laten zien dat we uitblinken in ons werk en waar we voor staan. Dat is zeker niet vanzelfsprekend en daarom hebben wij ervoor gekozen om jouw Blinkers cadeau te doen, het cadeau voor uitblinkers! Wij zien en waarderen jou en willen hier graag iets voor terugdoen.<br><br>We zijn trots waar we nu samen staan, mede dankzij jou, en hopen dat je deze uitdagingen met ons aan wilt blijven gaan. Geniet eerst van de feestdagen en zoek iets leuks uit voor jezelf en/of iemand anders. Fijne feestdagen voor jou en je dierbaren.<br><br><b>Met hartelijke kerstgroeten,<br>Directie</b>`;

/* ═══ SHARED BUTTON COMPONENT ═══ */
function Btn({ onClick, active, disabled, children, dark }: {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className="text-xs font-medium tracking-wide uppercase px-3 py-1.5 rounded-md transition-colors duration-200"
      style={{
        backgroundColor: active ? "#77a7b9" : dark ? "#1a1a1a" : "#f0f0f0",
        color: active || dark ? "#fff" : disabled ? "#bbb" : "#444",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ═══ INSIDE CARD COMPONENT ═══ */
function InsideCard({ insideText, editorRef, onInput, interactive, showSafeZone }: {
  insideText: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onInput: () => void;
  interactive: boolean;
  showSafeZone?: boolean;
}) {
  const initialized = useRef(false);
  useEffect(() => {
    if (!editorRef.current) return;
    if (!initialized.current) {
      editorRef.current.innerHTML = insideText;
      initialized.current = true;
      return;
    }
    if (editorRef.current.innerHTML !== insideText) {
      editorRef.current.innerHTML = insideText;
    }
  }, [insideText]);

  const safeZonePctW = (SAFE_ZONE_MM / A4_W) * 100;
  const safeZonePctH = (SAFE_ZONE_MM / A4_H) * 100;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: `${A4_W}/${A4_H}`,
        maxWidth: "460px",
        backgroundColor: "#faf8f5",
        borderRadius: "6px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.1)",
        backgroundImage: `url(${INSIDE_BG_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        ref={editorRef}
        contentEditable={interactive}
        suppressContentEditableWarning
        onInput={onInput}
        className="absolute"
        style={{
          top: "8.5%", left: "14.3%", width: "71.4%", height: "40%",
          fontFamily: "'Source Sans Pro', sans-serif",
          fontSize: "10px", lineHeight: "12px", color: "#2a2a2a",
          outline: "none", overflowY: "auto",
          cursor: interactive ? "text" : "default",
          wordBreak: "break-word",
        }}
      />
      {showSafeZone && (
        <div className="absolute pointer-events-none" style={{ left: `${safeZonePctW}%`, top: `${safeZonePctH}%`, right: `${safeZonePctW}%`, bottom: `${safeZonePctH}%`, border: "1px dashed rgba(255,0,0,0.4)" }}>
          <div className="absolute top-0 right-0 text-xs px-1" style={{ backgroundColor: "rgba(255,0,0,0.15)", color: "rgba(255,0,0,0.6)", fontSize: "9px" }}>
            veilige zone ({SAFE_ZONE_MM}mm)
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ HELPERS ═══ */
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function checkCmykSafe(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return !(sat > 0.85 && max > 0.8);
}

function drawCropMarks(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  const corners = [
    [BLEED, BLEED], [BLEED + w, BLEED],
    [BLEED, BLEED + h], [BLEED + w, BLEED + h],
  ];
  for (const [cx, cy] of corners) {
    const vy = cy === BLEED ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + vy * CROP_GAP);
    ctx.lineTo(cx, cy + vy * (CROP_GAP + CROP_LEN));
    ctx.stroke();
    const vx = cx === BLEED ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + vx * CROP_GAP, cy);
    ctx.lineTo(cx + vx * (CROP_GAP + CROP_LEN), cy);
    ctx.stroke();
  }
}

/* ═══ INDEXED DB ═══ */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const timeout = setTimeout(() => reject(new Error("IndexedDB timeout")), 3000);
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => { clearTimeout(timeout); resolve(req.result); };
      req.onerror = () => { clearTimeout(timeout); reject(req.error); };
      req.onblocked = () => { clearTimeout(timeout); reject(new Error("IndexedDB blocked")); };
    } catch (e) { clearTimeout(timeout); reject(e); }
  });
}

async function idbLoad(): Promise<CardState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
        req.onsuccess = () => {
          try {
            const val = req.result;
            if (val && typeof val.greeting === "string" && typeof val.photoZoom === "number") {
              if (typeof val.logoZoom !== "number") val.logoZoom = 1;
              if (!val.logoPos) val.logoPos = { x: 50, y: 50 };
              if (typeof val.bannerColor !== "string") val.bannerColor = "#ffffff";
              if (typeof val.insideText !== "string") val.insideText = DEFAULT_INSIDE_HTML;
              resolve(val as CardState);
            } else { resolve(null); }
          } catch { resolve(null); }
        };
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  } catch { return null; }
}

async function idbSave(state: CardState): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(state, STORAGE_KEY);
  } catch (e) { console.warn("Could not save card state to IndexedDB:", e); }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(STORAGE_KEY);
  } catch {}
}

/* ═══ UNDO SYSTEM ═══ */
interface CardState {
  photoSrc: string | null;
  photoZoom: number;
  photoPos: { x: number; y: number };
  logoSrc: string | null;
  logoZoom: number;
  logoPos: { x: number; y: number };
  greeting: string;
  fontSize: number;
  fontColor: string;
  bannerColor: string;
  insideText: string;
}

interface UndoState {
  history: CardState[];
  idx: number;
}

type UndoAction =
  | { type: "push"; payload: CardState }
  | { type: "reset"; payload: CardState }
  | { type: "undo" }
  | { type: "redo" };

function undoReducer(state: UndoState, action: UndoAction): UndoState {
  switch (action.type) {
    case "push":
      return { history: [...state.history.slice(0, state.idx + 1), action.payload], idx: state.idx + 1 };
    case "reset":
      return { history: [action.payload], idx: 0 };
    case "undo":
      return { ...state, idx: Math.max(0, state.idx - 1) };
    case "redo":
      return { ...state, idx: Math.min(state.history.length - 1, state.idx + 1) };
    default:
      return state;
  }
}

function useUndo(initial: CardState) {
  const [{ history, idx }, dispatch] = useReducer(undoReducer, { history: [initial], idx: 0 });
  const current = history[idx];
  const push = useCallback((s: CardState) => dispatch({ type: "push", payload: s }), []);
  const resetTo = useCallback((s: CardState) => dispatch({ type: "reset", payload: s }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return { current, push, resetTo, undo, redo, canUndo: idx > 0, canRedo: idx < history.length - 1 };
}

/* ═══ MAIN COMPONENT ═══ */
function CardConfigurator({
  defaultGreeting, bannerColor, showExportRef, defaultInsideText,
}: {
  defaultGreeting: string; bannerColor: string; showExportRef: boolean; defaultInsideText: string;
}) {
  const { interactive } = useWebflowContext();

  const defaultState: CardState = {
    photoSrc: null, photoZoom: 1, photoPos: { x: 50, y: 50 },
    logoSrc: null, logoZoom: 1, logoPos: { x: 50, y: 50 },
    greeting: defaultGreeting, fontSize: 18, fontColor: "#1a1a1a",
    bannerColor: bannerColor || "#ffffff",
    insideText: defaultInsideText || DEFAULT_INSIDE_HTML,
  };

  const { current: state, push, resetTo, undo, redo } = useUndo(defaultState);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    idbLoad().then((saved) => {
      if (cancelled) return;
      if (saved) resetTo(saved);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { idbSave(state); }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, loaded]);

  useEffect(() => {
    const id = "card-configurator-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=BioRhyme:wght@400;700&family=Source+Sans+Pro:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&display=swap";
    document.head.appendChild(link);
  }, []);

  const resetAll = useCallback(() => { idbClear().then(() => window.location.reload()); }, []);

  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editingLogo, setEditingLogo] = useState(false);
  const [photoDragging, setPhotoDragging] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [photoNatural, setPhotoNatural] = useState({ w: 0, h: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dragOverPhoto, setDragOverPhoto] = useState(false);
  const [dragOverLogo, setDragOverLogo] = useState(false);
  const [activeView, setActiveView] = useState<"front" | "inside">("front");
  const [insideZoom, setInsideZoom] = useState(1);
  const [livePhotoPos, setLivePhotoPos] = useState({ x: 50, y: 50 });
  const [livePhotoZoom, setLivePhotoZoom] = useState(1);
  const [liveLogoPos, setLiveLogoPos] = useState({ x: 50, y: 50 });
  const [liveLogoZoom, setLiveLogoZoom] = useState(1);
  const [greetingInput, setGreetingInput] = useState(state.greeting);

  const greetingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setGreetingInput(state.greeting); }, [state.greeting]);

  const onGreetingChange = useCallback((val: string) => {
    setGreetingInput(val);
    if (greetingDebounce.current) clearTimeout(greetingDebounce.current);
    greetingDebounce.current = setTimeout(() => { push({ ...state, greeting: val }); }, 400);
  }, [state, push]);

  useEffect(() => { setLivePhotoPos(state.photoPos); setLivePhotoZoom(state.photoZoom); }, [state.photoPos, state.photoZoom]);
  useEffect(() => { setLiveLogoPos(state.logoPos); setLiveLogoZoom(state.logoZoom); }, [state.logoPos, state.logoZoom]);

  const cardRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoDragStart = useRef({ x: 0, y: 0, px: 50, py: 50 });
  const logoDragStart = useRef({ x: 0, y: 0, px: 50, py: 50 });
  const cardDragStart = useRef({ x: 0, y: 0, rX: 0, rY: 0 });
  const logoContainerRef = useRef<HTMLDivElement>(null);
  const insideEditorRef = useRef<HTMLDivElement>(null);

  const update = useCallback((partial: Partial<CardState>) => { push({ ...state, ...partial }); }, [state, push]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file); });

  const processPhoto = useCallback(async (file: File) => {
    const dataUrl = await readFile(file);
    const img = new Image(); img.src = dataUrl;
    await new Promise((r) => (img.onload = r));
    setPhotoNatural({ w: img.width, h: img.height });
    setPhotoWarning(img.width < FRONT_W || img.height < FRONT_H
      ? `Resolutie te laag: ${img.width}×${img.height}px. Minimaal ${FRONT_W}×${FRONT_H}px.`
      : null);
    push({ ...state, photoSrc: dataUrl, photoZoom: 1, photoPos: { x: 50, y: 50 } });
    setLivePhotoPos({ x: 50, y: 50 }); setLivePhotoZoom(1); setEditingPhoto(true);
  }, [state, push]);

  const processLogo = useCallback(async (file: File) => {
    const dataUrl = await readFile(file);
    push({ ...state, logoSrc: dataUrl, logoZoom: 1, logoPos: { x: 50, y: 50 } });
    setLiveLogoPos({ x: 50, y: 50 }); setLiveLogoZoom(1); setEditingLogo(true);
  }, [state, push]);

  const onPhotoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOverPhoto(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) processPhoto(file);
  }, [processPhoto]);

  const onLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOverLogo(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/") || file?.name.endsWith(".svg")) processLogo(file);
  }, [processLogo]);

  const onLogoPointerDown = useCallback((e: React.PointerEvent) => {
    if (!editingLogo || !state.logoSrc) return;
    e.stopPropagation(); e.preventDefault(); setLogoDragging(true);
    logoDragStart.current = { x: e.clientX, y: e.clientY, px: liveLogoPos.x, py: liveLogoPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editingLogo, state.logoSrc, liveLogoPos]);

  const onLogoPointerMove = useCallback((e: React.PointerEvent) => {
    if (!logoDragging) return; e.stopPropagation();
    const rect = logoContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - logoDragStart.current.x) / rect.width) * 100 * 2.5;
    const dy = ((e.clientY - logoDragStart.current.y) / rect.height) * 100 * 2.5;
    setLiveLogoPos({ x: clamp(logoDragStart.current.px - dx, 0, 100), y: clamp(logoDragStart.current.py - dy, 0, 100) });
  }, [logoDragging]);

  const onLogoPointerUp = useCallback((e: React.PointerEvent) => {
    if (logoDragging) { e.stopPropagation(); setLogoDragging(false); update({ logoPos: liveLogoPos, logoZoom: liveLogoZoom }); }
  }, [logoDragging, liveLogoPos, liveLogoZoom, update]);

  const handleLogoZoom = useCallback((newZoom: number) => {
    const clamped = clamp(newZoom, 0.3, 3);
    setLiveLogoZoom(clamped); update({ logoZoom: clamped, logoPos: liveLogoPos });
  }, [update, liveLogoPos]);

  const onLogoWheel = useCallback((e: React.WheelEvent) => {
    if (!editingLogo || !state.logoSrc) return;
    e.stopPropagation(); e.preventDefault();
    handleLogoZoom(liveLogoZoom + (e.deltaY > 0 ? -0.1 : 0.1));
  }, [editingLogo, state.logoSrc, liveLogoZoom, handleLogoZoom]);

  const onPhotoPointerDown = useCallback((e: React.PointerEvent) => {
    if (!editingPhoto || !state.photoSrc) return;
    e.stopPropagation(); e.preventDefault(); setPhotoDragging(true);
    photoDragStart.current = { x: e.clientX, y: e.clientY, px: livePhotoPos.x, py: livePhotoPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editingPhoto, state.photoSrc, livePhotoPos]);

  const onPhotoPointerMove = useCallback((e: React.PointerEvent) => {
    if (!photoDragging) return; e.stopPropagation();
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sensitivity = 1.5 * livePhotoZoom;
    const dx = ((e.clientX - photoDragStart.current.x) / rect.width) * 100 * sensitivity;
    const dy = ((e.clientY - photoDragStart.current.y) / rect.height) * 100 * sensitivity;
    setLivePhotoPos({ x: clamp(photoDragStart.current.px - dx, 0, 100), y: clamp(photoDragStart.current.py - dy, 0, 100) });
  }, [photoDragging, livePhotoZoom]);

  const onPhotoPointerUp = useCallback((e: React.PointerEvent) => {
    if (photoDragging) { e.stopPropagation(); setPhotoDragging(false); update({ photoPos: livePhotoPos, photoZoom: livePhotoZoom }); }
  }, [photoDragging, livePhotoPos, livePhotoZoom, update]);

  const handlePhotoZoom = useCallback((newZoom: number) => {
    const clamped = clamp(newZoom, 1, 5);
    setLivePhotoZoom(clamped); update({ photoZoom: clamped, photoPos: livePhotoPos });
  }, [update, livePhotoPos]);

  const onPhotoWheel = useCallback((e: React.WheelEvent) => {
    if (!editingPhoto || !state.photoSrc) return;
    e.stopPropagation(); e.preventDefault();
    handlePhotoZoom(livePhotoZoom + (e.deltaY > 0 ? -0.15 : 0.15));
  }, [editingPhoto, state.photoSrc, livePhotoZoom, handlePhotoZoom]);

  const onCardPointerDown = useCallback((e: React.PointerEvent) => {
    if (editingPhoto) return; setDragging(true);
    cardDragStart.current = { x: e.clientX, y: e.clientY, rX: rotX, rY: rotY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [rotX, rotY, editingPhoto]);

  const onCardPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setRotY(clamp(cardDragStart.current.rY + (e.clientX - cardDragStart.current.x) * 0.3, -40, 40));
    setRotX(clamp(cardDragStart.current.rX - (e.clientY - cardDragStart.current.y) * 0.3, -30, 30));
  }, [dragging]);

  const onCardPointerUp = useCallback(() => setDragging(false), []);

  const onCardWheel = useCallback((e: React.WheelEvent) => {
    if (editingPhoto) return; e.stopPropagation();
    setZoom((z) => clamp(z + (e.deltaY > 0 ? -0.05 : 0.05), 0.5, 2));
  }, [editingPhoto]);

  const onInsideWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation(); e.preventDefault();
    setInsideZoom((z) => clamp(z + (e.deltaY > 0 ? -0.05 : 0.05), 0.5, 2));
  }, []);

  const cmykWarning = useMemo(() => {
    const w: string[] = [];
    if (!checkCmykSafe(state.fontColor)) w.push("Tekstkleur voorzijde");
    if (state.bannerColor && !checkCmykSafe(state.bannerColor)) w.push("Bannerkleur");
    return w;
  }, [state.fontColor, state.bannerColor]);

  const zoomDpiOk = useMemo(() => {
    if (!photoNatural.w) return true;
    const baseScale = Math.max(FRONT_BW / photoNatural.w, FRONT_BH / photoNatural.h);
    return photoNatural.w * baseScale * state.photoZoom >= FRONT_BW &&
           photoNatural.h * baseScale * state.photoZoom >= FRONT_BH;
  }, [photoNatural, state.photoZoom]);

  const renderFrontCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    canvas.width = FRONT_BW; canvas.height = FRONT_BH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, FRONT_BW, FRONT_BH);
    if (state.photoSrc) {
      const photo = await loadImg(state.photoSrc);
      const imgAspect = photo.width / photo.height;
      const canvasAspect = FRONT_BW / FRONT_BH;
      let baseW: number, baseH: number;
      if (imgAspect > canvasAspect) { baseH = FRONT_BH; baseW = baseH * imgAspect; }
      else { baseW = FRONT_BW; baseH = baseW / imgAspect; }
      const imgW = baseW * state.photoZoom, imgH = baseH * state.photoZoom;
      ctx.drawImage(photo, (FRONT_BW - imgW) * (state.photoPos.x / 100), (FRONT_BH - imgH) * (state.photoPos.y / 100), imgW, imgH);
      const bannerH = FRONT_BH * (BANNER_PCT / 100);
      const bannerTopY = FRONT_BH - bannerH;
      const svgToX = (sx: number) => (sx / 1000) * FRONT_BW;
      const svgToY = (sy: number) => bannerTopY + (sy / 300) * bannerH;
      ctx.fillStyle = state.bannerColor || "#fff";
      ctx.beginPath();
      ctx.moveTo(svgToX(-50), svgToY(300)); ctx.lineTo(svgToX(-50), svgToY(100));
      ctx.bezierCurveTo(svgToX(200), svgToY(-30), svgToX(800), svgToY(-30), svgToX(1050), svgToY(100));
      ctx.lineTo(svgToX(1050), svgToY(300)); ctx.closePath(); ctx.fill();
      const padScale = FRONT_BW / 640, padX = 48 * padScale, padBottom = 8 * padScale;
      const contentH = bannerH * 0.85, contentTopY = FRONT_BH - contentH, contentBottomY = FRONT_BH - padBottom;
      const fs = Math.round(state.fontSize * padScale);
      ctx.fillStyle = state.fontColor; ctx.font = `700 ${fs}px BioRhyme, serif`;
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(state.greeting, padX, contentTopY + (contentBottomY - contentTopY) / 2);
      if (state.logoSrc) {
        const logo = await loadImg(state.logoSrc);
        const lbw = 193 * padScale * state.logoZoom, lbh = 77 * padScale * state.logoZoom;
        const logoAreaX = FRONT_BW - padX - lbw;
        const logoAreaY = contentTopY + (contentBottomY - contentTopY - lbh) / 2;
        const logoOffsetX = (state.logoPos.x - 50) * 2 / 100 * lbw;
        const logoOffsetY = (state.logoPos.y - 50) * 2 / 100 * lbh;
        const ls = Math.min(lbw / logo.width, lbh / logo.height);
        ctx.drawImage(logo, logoAreaX + (lbw - logo.width * ls) / 2 + logoOffsetX, logoAreaY + (lbh - logo.height * ls) / 2 + logoOffsetY, logo.width * ls, logo.height * ls);
      }
    }
    drawCropMarks(ctx, FRONT_W, FRONT_H);
    return canvas;
  }, [state]);

  const renderInsideCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    canvas.width = INSIDE_BW; canvas.height = INSIDE_BH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#faf8f5"; ctx.fillRect(0, 0, INSIDE_BW, INSIDE_BH);
    try { const bg = await loadImg(INSIDE_BG_URL); ctx.drawImage(bg, 0, 0, INSIDE_BW, INSIDE_BH); } catch {}
    const textLeft = BLEED + Math.round(INSIDE_W * 0.143);
    const textTop = BLEED + Math.round(INSIDE_H * 0.085);
    const textWidth = Math.round(INSIDE_W * 0.714);
    const textHeight = Math.round(INSIDE_H * 0.40);
    const scaleFactor = INSIDE_BW / 460;
    const fSize = Math.round(9 * scaleFactor), lineH = Math.round(12 * scaleFactor);
    interface TextSegment { text: string; bold: boolean; italic: boolean; lineBreak?: boolean; }
    function parseHtmlSegments(html: string): TextSegment[] {
      const segments: TextSegment[] = [];
      const normalized = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(div|p)>/gi, "\n");
      let pos = 0, bold = false, italic = false;
      while (pos < normalized.length) {
        if (normalized[pos] === "<") {
          const tagEnd = normalized.indexOf(">", pos);
          if (tagEnd === -1) { pos++; continue; }
          const tag = normalized.slice(pos + 1, tagEnd).trim().toLowerCase();
          if (tag === "b" || tag === "strong") bold = true;
          else if (tag === "/b" || tag === "/strong") bold = false;
          else if (tag === "i" || tag === "em") italic = true;
          else if (tag === "/i" || tag === "/em") italic = false;
          pos = tagEnd + 1; continue;
        }
        let textEnd = normalized.indexOf("<", pos);
        if (textEnd === -1) textEnd = normalized.length;
        const rawText = normalized.slice(pos, textEnd); pos = textEnd;
        const parts = rawText.split("\n");
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) segments.push({ text: "", bold, italic, lineBreak: true });
          const decoded = parts[i].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
          if (decoded.length > 0) segments.push({ text: decoded, bold, italic });
        }
      }
      return segments;
    }
    const segments = parseHtmlSegments(state.insideText || DEFAULT_INSIDE_HTML);
    ctx.textBaseline = "top"; ctx.fillStyle = "#2a2a2a";
    let curX = textLeft, curY = textTop;
    function setFont(bold: boolean, italic: boolean) {
      ctx.font = `${italic ? "italic " : ""}${bold ? "700" : "400"} ${fSize}px 'Source Sans Pro', sans-serif`;
    }
    for (const seg of segments) {
      if (seg.lineBreak) { curX = textLeft; curY += lineH; if (curY > textTop + textHeight) break; continue; }
      setFont(seg.bold, seg.italic);
      for (const word of seg.text.split(/(\s+)/)) {
        if (!word.length) continue;
        const ww = ctx.measureText(word).width;
        if (curX + ww > textLeft + textWidth && curX > textLeft) {
          curX = textLeft; curY += lineH;
          if (curY > textTop + textHeight) break;
          if (!word.trim().length) continue;
        }
        if (curY > textTop + textHeight) break;
        ctx.fillText(word, curX, curY); curX += ww;
      }
      if (curY > textTop + textHeight) break;
    }
    drawCropMarks(ctx, INSIDE_W, INSIDE_H);
    return canvas;
  }, [state.insideText]);

  const exportPDF = useCallback(async () => {
    setExporting(true); setExportError(null);
    try {
      // @ts-ignore
      const { jsPDF } = await import("jspdf");
      const frontCanvas = await renderFrontCanvas();
      const insideCanvas = await renderInsideCanvas();
      const frontTotalW = A5_W + BLEED_MM * 2, frontTotalH = A5_H + BLEED_MM * 2;
      const insideTotalW = A4_W + BLEED_MM * 2, insideTotalH = A4_H + BLEED_MM * 2;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [frontTotalW, frontTotalH] });
      pdf.addImage(frontCanvas.toDataURL("image/png"), "PNG", 0, 0, frontTotalW, frontTotalH);
      pdf.addPage([insideTotalW, insideTotalH], "portrait");
      pdf.addImage(insideCanvas.toDataURL("image/png"), "PNG", 0, 0, insideTotalW, insideTotalH);
      pdf.save("kaart-drukklaar-300dpi-3mm-bleed.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
      setExportError("PDF exporteren mislukt. Controleer je verbinding en probeer opnieuw.");
    } finally { setExporting(false); }
  }, [renderFrontCanvas, renderInsideCanvas]);

  const coverBgStyle = useMemo(() => {
    if (!state.photoSrc) return {};
    if (!photoNatural.w || !photoNatural.h) {
      return { backgroundImage: `url(${state.photoSrc})`, backgroundSize: "cover", backgroundPosition: `${livePhotoPos.x}% ${livePhotoPos.y}%`, backgroundRepeat: "no-repeat" as const };
    }
    const sizeStr = (photoNatural.w / photoNatural.h) > (A5_W / A5_H)
      ? `auto ${livePhotoZoom * 100}%`
      : `${livePhotoZoom * 100}% auto`;
    return { backgroundImage: `url(${state.photoSrc})`, backgroundSize: sizeStr, backgroundPosition: `${livePhotoPos.x}% ${livePhotoPos.y}%`, backgroundRepeat: "no-repeat" as const };
  }, [state.photoSrc, livePhotoZoom, livePhotoPos, photoNatural]);

  const safeZonePct = (SAFE_ZONE_MM / A5_W) * 100;
  const safeZonePctH = (SAFE_ZONE_MM / A5_H) * 100;
  const savedRange = useRef<Range | null>(null);

  const saveSelection = useCallback(() => {
    const editor = insideEditorRef.current; if (!editor) return;
    const root = editor.getRootNode() as ShadowRoot | Document;
    const sel = (root as any).getSelection ? (root as any).getSelection() : document.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
    }
  }, []);

  const findWrapperTag = useCallback((node: Node | null, tagUpper: string, editor: HTMLElement): HTMLElement | null => {
    while (node && node !== editor) {
      if (node instanceof HTMLElement && node.tagName === tagUpper) return node;
      node = node.parentNode;
    }
    return null;
  }, []);

  const execFormat = useCallback((tag: string) => {
    const editor = insideEditorRef.current; if (!editor) return;
    const range = savedRange.current;
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    editor.focus();
    const root = editor.getRootNode() as ShadowRoot | Document;
    const sel = (root as any).getSelection ? (root as any).getSelection() : document.getSelection();
    if (!sel) return;
    sel.removeAllRanges(); sel.addRange(range);
    const tagUpper = tag.toUpperCase();
    const startWrapper = findWrapperTag(range.startContainer, tagUpper, editor);
    const endWrapper = findWrapperTag(range.endContainer, tagUpper, editor);
    if (startWrapper && startWrapper === endWrapper) {
      const parent = startWrapper.parentNode;
      if (parent) { while (startWrapper.firstChild) parent.insertBefore(startWrapper.firstChild, startWrapper); parent.removeChild(startWrapper); editor.normalize(); }
    } else if (range.toString().length > 0) {
      try { const w = document.createElement(tag); range.surroundContents(w); }
      catch { const f = range.extractContents(); const w = document.createElement(tag); w.appendChild(f); range.insertNode(w); }
    }
    savedRange.current = null;
    update({ insideText: editor.innerHTML });
  }, [update, findWrapperTag]);

  const onInsideTextInput = useCallback(() => {
    if (insideEditorRef.current) update({ insideText: insideEditorRef.current.innerHTML });
  }, [update]);

  return (
    <div className="flex justify-center w-full p-6 max-[992px]:p-4 max-[480px]:p-3" style={{ boxSizing: "border-box", fontFamily: "'Source Sans Pro', sans-serif" }}>
      <div className="flex flex-row items-start gap-6 w-full max-[992px]:flex-col max-[992px]:items-center max-[992px]:gap-4" style={{ maxWidth: "1000px" }}>

        {/* ── LEFT ── */}
        <div className="flex-1 flex flex-col items-center min-w-0 max-[992px]:w-full gap-3">
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: "#f0f0f0" }}>
            {(["front", "inside"] as const).map((view) => (
              <button key={view} onClick={() => { setActiveView(view); setEditingPhoto(false); setEditingLogo(false); }}
                className="text-xs font-semibold tracking-wide uppercase px-4 py-1.5 rounded-md transition-colors duration-200"
                style={{ backgroundColor: activeView === view ? "#fff" : "transparent", color: activeView === view ? "#333" : "#999", border: "none", cursor: "pointer", boxShadow: activeView === view ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                {view === "front" ? "Voorzijde" : "Binnenkant"}
              </button>
            ))}
          </div>

          {activeView === "front" ? (
            <>
              <div className="flex items-center justify-center w-full" style={{ perspective: "1200px" }} onWheel={onCardWheel}>
                <div ref={cardRef} className="relative select-none w-full"
                  style={{ maxWidth: "640px", aspectRatio: `${A5_W}/${A5_H}`, transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`, transformStyle: "preserve-3d", transition: dragging ? "none" : "transform 0.4s cubic-bezier(.25,.8,.25,1)", boxShadow: `${rotY * 0.6}px ${8 + rotX * 0.4}px 30px rgba(0,0,0,0.25)`, borderRadius: "6px", overflow: "hidden", cursor: editingPhoto && state.photoSrc ? "move" : "grab", backgroundColor: "#fff", touchAction: editingPhoto ? "none" : "auto" }}
                  onPointerDown={editingPhoto ? onPhotoPointerDown : onCardPointerDown}
                  onPointerMove={editingPhoto ? onPhotoPointerMove : onCardPointerMove}
                  onPointerUp={editingPhoto ? onPhotoPointerUp : onCardPointerUp}
                  onPointerCancel={editingPhoto ? onPhotoPointerUp : onCardPointerUp}
                  onWheel={editingPhoto ? onPhotoWheel : onCardWheel}>
                  <div className="absolute inset-0" style={state.photoSrc ? coverBgStyle : { backgroundColor: "#c4ccd4" }}>
                    {!state.photoSrc && (
                      <div className="flex items-center justify-center h-full text-white/60 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      </div>
                    )}
                    {editingPhoto && state.photoSrc && (
                      <div className="absolute inset-0 pointer-events-none" style={{ border: "2px dashed rgba(255,255,255,0.6)" }}>
                        {showGrid && (<>
                          <div className="absolute" style={{ left: "33.33%", top: 0, bottom: 0, width: "1px", backgroundColor: "rgba(255,255,255,0.3)" }} />
                          <div className="absolute" style={{ left: "66.66%", top: 0, bottom: 0, width: "1px", backgroundColor: "rgba(255,255,255,0.3)" }} />
                          <div className="absolute" style={{ top: "33.33%", left: 0, right: 0, height: "1px", backgroundColor: "rgba(255,255,255,0.3)" }} />
                          <div className="absolute" style={{ top: "66.66%", left: 0, right: 0, height: "1px", backgroundColor: "rgba(255,255,255,0.3)" }} />
                        </>)}
                        <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded" style={{ backgroundColor: !zoomDpiOk ? "rgba(200,40,40,0.8)" : "rgba(0,0,0,0.5)", color: "#fff" }}>
                          {!zoomDpiOk ? `⚠ Resolutie te laag bij ${Math.round(livePhotoZoom * 100)}%` : `${Math.round(livePhotoZoom * 100)}% · Sleep om te verschuiven`}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="absolute left-0 right-0 bottom-0" style={{ height: `${BANNER_PCT}%` }}>
                    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ display: "block" }}>
                      <path d="M-50,300 L-50,100 C200,-30 800,-30 1050,100 L1050,300 Z" fill={state.bannerColor || "#fff"} />
                    </svg>
                    <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between pl-12 pr-12 max-[480px]:pl-6 max-[480px]:pr-6" style={{ height: "85%", paddingBottom: "8px", boxSizing: "border-box" }}>
                      <p className="leading-tight max-[480px]:text-sm" style={{ color: state.fontColor, fontFamily: "'BioRhyme', serif", fontWeight: 700, fontSize: `${state.fontSize}px`, margin: 0, maxWidth: "60%", wordBreak: "break-word" }}>
                        {greetingInput}
                      </p>
                      <div ref={logoContainerRef} className="relative flex items-center justify-center rounded"
                        style={{ width: "193px", height: "77px", minWidth: "144px", minHeight: "58px", backgroundColor: state.logoSrc ? "transparent" : "#e8e8e8", overflow: "hidden", border: state.logoSrc ? (editingLogo ? "2px dashed rgba(119,167,185,0.6)" : "none") : "1px dashed #bbb", cursor: editingLogo && state.logoSrc ? "move" : "default", touchAction: editingLogo ? "none" : "auto" }}
                        onPointerDown={editingLogo ? onLogoPointerDown : undefined}
                        onPointerMove={editingLogo ? onLogoPointerMove : undefined}
                        onPointerUp={editingLogo ? onLogoPointerUp : undefined}
                        onPointerCancel={editingLogo ? onLogoPointerUp : undefined}
                        onWheel={editingLogo ? onLogoWheel : undefined}>
                        {state.logoSrc ? (
                          <img src={state.logoSrc} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain", transform: `translate(${(liveLogoPos.x - 50) * 2}%, ${(liveLogoPos.y - 50) * 2}%) scale(${liveLogoZoom})`, transformOrigin: "center center", pointerEvents: "none" }} draggable={false} />
                        ) : (
                          <span className="text-xs text-gray-400 pointer-events-none select-none">Logo</span>
                        )}
                        {editingLogo && state.logoSrc && (
                          <div className="absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(119,167,185,0.85)", color: "#fff", fontSize: "9px", whiteSpace: "nowrap", pointerEvents: "none" }}>
                            {Math.round(liveLogoZoom * 100)}% · Sleep om te verschuiven
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {showSafeZone && (
                    <div className="absolute pointer-events-none" style={{ left: `${safeZonePct}%`, top: `${safeZonePctH}%`, right: `${safeZonePct}%`, bottom: `${safeZonePctH}%`, border: "1px dashed rgba(255,0,0,0.4)" }}>
                      <div className="absolute top-0 right-0 text-xs px-1" style={{ backgroundColor: "rgba(255,0,0,0.15)", color: "rgba(255,0,0,0.6)", fontSize: "9px" }}>veilige zone ({SAFE_ZONE_MM}mm)</div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-center" style={{ color: "#444", margin: 0, maxWidth: "640px" }}>
                {editingPhoto ? "Sleep foto · Scroll of slider = zoom · Ctrl+Z = ongedaan maken" : editingLogo ? "Sleep logo · Scroll of slider = zoom · Ctrl+Z = ongedaan maken" : "Sleep kaart = draaien · Scroll = zoom · Ctrl+Z / Ctrl+Shift+Z = undo/redo"}
              </p>
              <div className="flex items-center justify-center flex-wrap gap-1.5 w-full" style={{ maxWidth: "640px" }}>
                {!editingPhoto && !editingLogo && (<>
                  <Btn onClick={() => { setRotX(0); setRotY(0); setZoom(1); }}>↺ Herstel</Btn>
                  <Btn onClick={() => setShowSafeZone((v) => !v)} active={showSafeZone}>Veilige zone</Btn>
                </>)}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-center" style={{ color: "#888", margin: 0, maxWidth: "460px" }}>
                Klik op de tekst om te bewerken. [naam] wordt door de drukker vervangen.
              </p>
              <div className="flex items-center justify-center w-full" onWheel={onInsideWheel}>
                <div className="relative select-none w-full" style={{ maxWidth: "460px", aspectRatio: `${A4_W}/${A4_H}`, transform: `scale(${insideZoom})`, transformOrigin: "center center", transition: "transform 0.2s ease-out" }}>
                  <InsideCard insideText={state.insideText} editorRef={insideEditorRef} onInput={onInsideTextInput} interactive={interactive} showSafeZone={showSafeZone} />
                </div>
              </div>
              <div className="flex items-center justify-center flex-wrap gap-1.5 w-full" style={{ maxWidth: "460px" }}>
                <Btn onClick={() => setInsideZoom(1)}>↺ Herstel</Btn>
                <Btn onClick={() => setShowSafeZone((v) => !v)} active={showSafeZone}>Veilige zone</Btn>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT ── */}
        <div className="flex flex-col gap-4 max-[992px]:w-full" style={{ width: "320px", maxWidth: "100%", flexShrink: 0 }}>
          {activeView === "inside" && (<>
            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Brieftekst</span>
              <div className="flex items-center gap-1">
                {(["b", "i"] as const).map((tag) => (
                  <button key={tag} onMouseDown={saveSelection} onClick={() => execFormat(tag)}
                    className="flex items-center justify-center rounded-md text-sm transition-colors duration-150"
                    style={{ width: "32px", height: "32px", backgroundColor: "#f0f0f0", border: "1px solid #e0e0e0", cursor: "pointer", color: "#444", fontWeight: tag === "b" ? 700 : 400, fontStyle: tag === "i" ? "italic" : "normal", fontFamily: "'Source Sans Pro', sans-serif" }}>
                    {tag.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs" style={{ color: "#aaa", margin: 0 }}>Selecteer tekst en klik B of I. Gebruik [naam] als variabele.</p>
            </div>
            <div style={{ height: "1px", backgroundColor: "#e8e8e8" }} />
          </>)}

          <div className="flex flex-col gap-1.5 w-full" onDragOver={(e) => { e.preventDefault(); setDragOverPhoto(true); }} onDragLeave={() => setDragOverPhoto(false)} onDrop={onPhotoDrop}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Foto</span>
            <button type="button" onClick={() => photoInputRef.current?.click()} className="flex items-center justify-center rounded-lg text-sm" style={{ height: "40px", backgroundColor: dragOverPhoto ? "#e8f4ff" : photoWarning ? "#fff5f5" : "#f7f7f7", border: dragOverPhoto ? "2px dashed #77a7b9" : photoWarning ? "1px solid #e8a0a0" : "1px solid #e0e0e0", color: "#666", cursor: "pointer", width: "100%" }}>
              {dragOverPhoto ? "Laat los" : state.photoSrc ? (photoWarning ? "⚠ Te laag" : "✓ Geüpload") : "Kies of sleep bestand"}
            </button>
            {photoWarning && <p className="text-xs leading-tight" style={{ color: "#c44", margin: 0 }}>{photoWarning}</p>}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) processPhoto(f); }} style={{ display: "none" }} />
            {state.photoSrc && <Btn onClick={() => { setEditingPhoto((v) => !v); setEditingLogo(false); }} active={editingPhoto}>{editingPhoto ? "✓ Klaar" : "Bewerk foto"}</Btn>}
            {editingPhoto && state.photoSrc && (<>
              <div className="flex items-center gap-1.5">
                <Btn onClick={() => { setLivePhotoZoom(1); setLivePhotoPos({ x: 50, y: 50 }); update({ photoZoom: 1, photoPos: { x: 50, y: 50 } }); }}>↺ Reset</Btn>
                <Btn onClick={() => setShowGrid((v) => !v)} active={showGrid}>Raster</Btn>
              </div>
              <div className="flex items-center gap-2 w-full">
                <button onClick={() => handlePhotoZoom(livePhotoZoom - 0.01)} disabled={livePhotoZoom <= 1} className="flex items-center justify-center rounded-md text-sm font-bold" style={{ width: "28px", height: "28px", backgroundColor: "#f0f0f0", border: "1px solid #e0e0e0", color: livePhotoZoom <= 1 ? "#ccc" : "#444", cursor: livePhotoZoom <= 1 ? "not-allowed" : "pointer", flexShrink: 0 }}>−</button>
                <input type="range" min={100} max={500} step={1} value={Math.round(livePhotoZoom * 100)} onChange={(e) => handlePhotoZoom(Number(e.target.value) / 100)} className="flex-1" style={{ accentColor: "#77a7b9", cursor: "pointer" }} />
                <button onClick={() => handlePhotoZoom(livePhotoZoom + 0.01)} disabled={livePhotoZoom >= 5} className="flex items-center justify-center rounded-md text-sm font-bold" style={{ width: "28px", height: "28px", backgroundColor: "#f0f0f0", border: "1px solid #e0e0e0", color: livePhotoZoom >= 5 ? "#ccc" : "#444", cursor: livePhotoZoom >= 5 ? "not-allowed" : "pointer", flexShrink: 0 }}>+</button>
                <span className="text-xs tabular-nums font-medium" style={{ color: "#666", minWidth: "36px", textAlign: "right" }}>{Math.round(livePhotoZoom * 100)}%</span>
              </div>
            </>)}
          </div>

          <div className="flex flex-col gap-1.5 w-full" onDragOver={(e) => { e.preventDefault(); setDragOverLogo(true); }} onDragLeave={() => setDragOverLogo(false)} onDrop={onLogoDrop}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Logo</span>
            <button type="button" onClick={() => logoInputRef.current?.click()} className="flex items-center justify-center rounded-lg text-sm" style={{ height: "40px", backgroundColor: dragOverLogo ? "#e8f4ff" : "#f7f7f7", border: dragOverLogo ? "2px dashed #77a7b9" : "1px solid #e0e0e0", color: "#666", cursor: "pointer", width: "100%" }}>
              {dragOverLogo ? "Laat los" : state.logoSrc ? "✓ Geüpload" : "Kies of sleep bestand"}
            </button>
            <p className="text-xs" style={{ color: "#aaa", margin: 0 }}>SVG aanbevolen, of PNG</p>
            <input ref={logoInputRef} type="file" accept="image/*,.svg" onChange={(e) => { const f = e.target.files?.[0]; if (f) processLogo(f); }} style={{ display: "none" }} />
            {state.logoSrc && !editingPhoto && <Btn onClick={() => { setEditingLogo((v) => !v); setEditingPhoto(false); }} active={editingLogo}>{editingLogo ? "✓ Klaar" : "Bewerk logo"}</Btn>}
            {editingLogo && state.logoSrc && (<>
              <div className="flex items-center gap-1.5">
                <Btn onClick={() => { setLiveLogoZoom(1); setLiveLogoPos({ x: 50, y: 50 }); update({ logoZoom: 1, logoPos: { x: 50, y: 50 } }); }}>↺ Reset</Btn>
              </div>
              <div className="flex items-center gap-2 w-full">
                <button onClick={() => handleLogoZoom(liveLogoZoom - 0.05)} disabled={liveLogoZoom <= 0.3} className="flex items-center justify-center rounded-md text-sm font-bold" style={{ width: "28px", height: "28px", backgroundColor: "#f0f0f0", border: "1px solid #e0e0e0", color: liveLogoZoom <= 0.3 ? "#ccc" : "#444", cursor: liveLogoZoom <= 0.3 ? "not-allowed" : "pointer", flexShrink: 0 }}>−</button>
                <input type="range" min={30} max={300} step={1} value={Math.round(liveLogoZoom * 100)} onChange={(e) => handleLogoZoom(Number(e.target.value) / 100)} className="flex-1" style={{ accentColor: "#77a7b9", cursor: "pointer" }} />
                <button onClick={() => handleLogoZoom(liveLogoZoom + 0.05)} disabled={liveLogoZoom >= 3} className="flex items-center justify-center rounded-md text-sm font-bold" style={{ width: "28px", height: "28px", backgroundColor: "#f0f0f0", border: "1px solid #e0e0e0", color: liveLogoZoom >= 3 ? "#ccc" : "#444", cursor: liveLogoZoom >= 3 ? "not-allowed" : "pointer", flexShrink: 0 }}>+</button>
                <span className="text-xs tabular-nums font-medium" style={{ color: "#666", minWidth: "36px", textAlign: "right" }}>{Math.round(liveLogoZoom * 100)}%</span>
              </div>
            </>)}
          </div>

          <div style={{ height: "1px", backgroundColor: "#e8e8e8" }} />

          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Begroeting</span>
            <input type="text" value={greetingInput} onChange={(e) => onGreetingChange(e.target.value)} className="rounded-lg text-sm outline-none" style={{ height: "40px", paddingLeft: "12px", paddingRight: "12px", backgroundColor: "#f7f7f7", border: "1px solid #e0e0e0", color: "#333", width: "100%", boxSizing: "border-box" }} />
            <div className="flex gap-1.5 items-center">
              <span className="text-xs" style={{ color: "#aaa" }}>Grootte</span>
              <input type="number" value={state.fontSize} onChange={(e) => update({ fontSize: clamp(Number(e.target.value), 8, 48) })} className="rounded text-xs outline-none text-center" style={{ width: "48px", height: "28px", backgroundColor: "#f7f7f7", border: "1px solid #e0e0e0", color: "#333" }} />
              <span className="text-xs" style={{ color: "#aaa", marginLeft: "8px" }}>Kleur</span>
              <input type="color" value={state.fontColor} onChange={(e) => update({ fontColor: e.target.value })} className="rounded" style={{ width: "28px", height: "28px", border: "1px solid #e0e0e0", cursor: "pointer", padding: 0 }} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Curved banner</span>
            <div className="flex gap-1.5 items-center">
              <span className="text-xs" style={{ color: "#aaa" }}>Kleur</span>
              <input type="color" value={state.bannerColor} onChange={(e) => update({ bannerColor: e.target.value })} className="rounded" style={{ width: "28px", height: "28px", border: "1px solid #e0e0e0", cursor: "pointer", padding: 0 }} />
              <span className="text-xs tabular-nums" style={{ color: "#aaa" }}>{state.bannerColor}</span>
            </div>
          </div>

          {cmykWarning.length > 0 && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fff8e6", border: "1px solid #f0d060", color: "#8a6d00" }}>
              ⚠ CMYK: {cmykWarning.join(", ")} — kan in druk anders uitzien.
            </div>
          )}

          <div style={{ height: "1px", backgroundColor: "#e8e8e8" }} />

          {exportError && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fff5f5", border: "1px solid #e8a0a0", color: "#c44" }}>
              {exportError}
            </div>
          )}

          <div className="flex items-center gap-1.5 w-full">
            <Btn onClick={() => exportPDF()} disabled={!state.photoSrc || exporting} dark>
              {exporting ? "Exporteren…" : "↓ Exporteer PDF"}
            </Btn>
            <Btn onClick={resetAll}>✕ Opnieuw</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardConfiguratorWrapper(p: {
  defaultGreeting: string; bannerColor: string; showExportRef: boolean; defaultInsideText: string;
}) {
  return <ErrorBoundary><CardConfigurator {...p} /></ErrorBoundary>;
}

export default declareComponent(CardConfiguratorWrapper, {
  name: "Card Configurator",
  description: "Volledige kaartconfigurator met voor/binnen/achterzijde, undo/redo, drag & drop, tekststyling, veilige zone en CMYK-waarschuwing.",
  group: "Cards",
  props: {
    defaultGreeting: props.Text({ name: "Begroeting", defaultValue: "Fijne feestdagen" }),
    bannerColor: props.Text({ name: "Banner kleur", defaultValue: "#ffffff" }),
    showExportRef: props.Boolean({ name: "Toon export info", defaultValue: false }),
    defaultInsideText: props.Text({ name: "Binnentekst", defaultValue: "" }),
  },
});
