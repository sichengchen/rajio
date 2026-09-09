export const controlChannel = "desktop:controls";
export const shortcutActions = ["toggle", "back", "forward", "next"] as const;
export type ShortcutAction = (typeof shortcutActions)[number];
export type ControlCommand = {
  action: ShortcutAction | "mini" | "show" | "settings" | "seek";
  value?: number;
};
export interface ControlState {
  title: string;
  show: string;
  artwork?: string;
  dark?: boolean;
  episodeId: string;
  playing: boolean;
  position: number;
  duration: number;
  locale: string;
  error: string | null;
}
export type ShortcutBindings = Record<ShortcutAction, { accelerator: string; global: boolean }>;
export const defaultShortcuts: ShortcutBindings = {
  toggle: { accelerator: "Space", global: false },
  back: { accelerator: "Left", global: false },
  forward: { accelerator: "Right", global: false },
  next: { accelerator: "CommandOrControl+Shift+Right", global: false },
};
export const shortcutLabels = {
  toggle: "Play/Pause",
  back: "Skip Back",
  forward: "Skip Forward",
  next: "Next Episode",
  mini: "Mini Player",
};
export const emptyControlState: ControlState = {
  title: "",
  show: "",
  episodeId: "",
  playing: false,
  position: 0,
  duration: 0,
  locale: "en",
  error: null,
};
export function validateShortcuts(value: unknown): ShortcutBindings {
  const result = {} as ShortcutBindings;
  const used = new Set<string>();
  for (const action of shortcutActions) {
    const item = (value as ShortcutBindings)?.[action];
    if (!item || typeof item.accelerator !== "string" || typeof item.global !== "boolean")
      throw new Error("Invalid shortcut");
    const keys = item.accelerator.split("+");
    const key = keys.pop()!;
    const modifiers = ["CommandOrControl", "Alt", "Shift"];
    if (
      item.accelerator &&
      (!/^([A-Z0-9]|Space|Left|Right|Up|Down|F([1-9]|1[0-9]|2[0-4]))$/.test(key) ||
        keys.some((k) => !modifiers.includes(k)) ||
        new Set(keys).size !== keys.length)
    )
      throw new Error("Invalid shortcut");
    const accelerator = [...modifiers.filter((k) => keys.includes(k)), key].join("+");
    if (
      item.global &&
      item.accelerator &&
      !keys.includes("CommandOrControl") &&
      !keys.includes("Alt")
    )
      throw new Error("Global shortcuts require Command/Ctrl or Alt");
    if (
      item.accelerator &&
      (used.has(accelerator) ||
        [
          "CommandOrControl+Q",
          "CommandOrControl+W",
          "CommandOrControl+C",
          "CommandOrControl+V",
          "CommandOrControl+X",
          "CommandOrControl+A",
          "CommandOrControl+Z",
          "CommandOrControl+Shift+Z",
          "CommandOrControl+R",
        ].includes(accelerator))
    )
      throw new Error("Shortcut conflict");
    if (item.accelerator) used.add(accelerator);
    result[action] = { accelerator: item.accelerator ? accelerator : "", global: item.global };
  }
  return result;
}
export interface ControlsApi {
  showCoverMenu(): void;
  get(): Promise<ControlState>;
  publish(state: ControlState): void;
  command(command: ControlCommand): void;
  onState(callback: (state: ControlState) => void): () => void;
  onCommand(callback: (command: ControlCommand) => void): () => void;
  shortcuts(): Promise<{ bindings: ShortcutBindings; error?: string }>;
  saveShortcuts(bindings: ShortcutBindings): Promise<void>;
  onShortcuts(callback: (bindings: ShortcutBindings) => void): () => void;
}
