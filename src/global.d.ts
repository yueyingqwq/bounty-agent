// Global type declarations for Computer Use runtime
interface SkyAPI {
  list_apps(): Promise<Array<{ id: string; name?: string }>>;
  list_windows(): Promise<Array<{ app?: string; id: number; title?: string }>>;
  launch_app(input: { app: string }): Promise<void>;
  activate_window(input: { window: { id: number; app?: string; title?: string } }): Promise<void>;
  get_window_state(input: { window: { id: number; app?: string; title?: string }; include_text?: boolean }): Promise<{
    accessibility?: { tree: string };
    screenshots?: Array<{ id: string; url: string; width?: number; height?: number }>;
  }>;
  press_key(input: { key: string; window: { id: number } }): Promise<void>;
  type_text(input: { text: string; window: { id: number } }): Promise<void>;
  click(input: { x: number; y: number; window: { id: number } }): Promise<void>;
}

declare var sky: SkyAPI | undefined;
