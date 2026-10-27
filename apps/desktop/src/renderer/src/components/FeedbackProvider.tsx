import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type NoticeKind = "info" | "success" | "warning";
interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}
interface PromptOptions {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}
interface FeedbackApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  prompt(options: PromptOptions): Promise<string | null>;
  notify(message: string, kind?: NoticeKind): void;
}
interface ConfirmRequest extends ConfirmOptions {
  resolve(value: boolean): void;
}
interface Notice {
  id: string;
  message: string;
  kind: NoticeKind;
}
interface PromptRequest extends PromptOptions {
  resolve(value: string | null): void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(
    null,
  );
  const [promptValue, setPromptValue] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setConfirmation({ ...options, resolve }),
      ),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(options.initialValue || "");
        setPromptRequest({ ...options, resolve });
      }),
    [],
  );
  const notify = useCallback((message: string, kind: NoticeKind = "info") => {
    const id = crypto.randomUUID();
    setNotices((current) => [...current, { id, message, kind }]);
    window.setTimeout(
      () =>
        setNotices((current) => current.filter((notice) => notice.id !== id)),
      6000,
    );
  }, []);
  const finish = useCallback(
    (value: boolean) => {
      confirmation?.resolve(value);
      setConfirmation(null);
    },
    [confirmation],
  );
  const finishPrompt = useCallback(
    (value: string | null) => {
      promptRequest?.resolve(value);
      setPromptRequest(null);
    },
    [promptRequest],
  );
  useEffect(() => {
    if (!confirmation) return;
    confirmButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [confirmation, finish]);
  useEffect(() => {
    if (!promptRequest) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishPrompt(null);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [finishPrompt, promptRequest]);

  return (
    <FeedbackContext.Provider value={{ confirm, prompt, notify }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {notices.map((notice) => (
          <div className={`toast ${notice.kind}`} key={notice.id}>
            {notice.kind === "success" ? (
              <CheckCircle2 />
            ) : notice.kind === "warning" ? (
              <AlertTriangle />
            ) : (
              <Info />
            )}
            <span>{notice.message}</span>
            <button
              aria-label="Benachrichtigung schließen"
              onClick={() =>
                setNotices((current) =>
                  current.filter((item) => item.id !== notice.id),
                )
              }
            >
              <X />
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <div
          className="modal-backdrop feedback-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) finish(false);
          }}
        >
          <section
            className="modal confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <AlertTriangle />
            <h2 id="confirm-title">{confirmation.title}</h2>
            <p id="confirm-message">{confirmation.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => finish(false)}
              >
                Abbrechen
              </button>
              <button
                ref={confirmButton}
                type="button"
                className={
                  confirmation.destructive ? "danger-action" : "primary"
                }
                onClick={() => finish(true)}
              >
                {confirmation.confirmLabel || "Bestätigen"}
              </button>
            </div>
          </section>
        </div>
      )}
      {promptRequest && (
        <div className="modal-backdrop feedback-backdrop" role="presentation">
          <form
            className="modal confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
            onSubmit={(event) => {
              event.preventDefault();
              finishPrompt(promptValue.trim() || null);
            }}
          >
            <h2 id="prompt-title">{promptRequest.title}</h2>
            {promptRequest.message && <p>{promptRequest.message}</p>}
            <input
              autoFocus
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={promptRequest.placeholder}
              maxLength={120}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => finishPrompt(null)}
              >
                Abbrechen
              </button>
              <button className="primary" disabled={!promptValue.trim()}>
                {promptRequest.confirmLabel || "Übernehmen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const value = useContext(FeedbackContext);
  if (!value)
    throw new Error(
      "useFeedback muss innerhalb des FeedbackProvider verwendet werden.",
    );
  return value;
}
