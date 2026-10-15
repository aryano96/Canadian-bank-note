/** Canvas colours come from the active CSS theme so canvas and DOM always match. */
export interface StagePalette {
  ink: string;
  grid: string;
  text: string;
  holoA: string;
  holoB: string;
  holoC: string;
  gold: string;
  win: string;
  loss: string;
}

export function readPalette(el: Element): StagePalette {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ink: v("--stage-ink"),
    grid: v("--stage-grid"),
    text: v("--text-muted"),
    holoA: v("--holo-a"),
    holoB: v("--holo-b"),
    holoC: v("--holo-c"),
    gold: v("--gold"),
    win: v("--win"),
    loss: v("--loss"),
  };
}
