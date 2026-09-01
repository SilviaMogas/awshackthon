/** Tiny hyperscript-style DOM helper (no framework, no dependencies). */

type Child = Node | string | number | false | null | undefined;

export interface ElProps {
  class?: string;
  id?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  src?: string;
  alt?: string;
  role?: string;
  disabled?: boolean;
  checked?: boolean;
  name?: string;
  for?: string;
  ariaLabel?: string;
  ariaLive?: string;
  ariaHidden?: string;
  dataset?: Record<string, string>;
  style?: string;
  html?: string;
  onclick?: (e: Event) => void;
  onchange?: (e: Event) => void;
  oninput?: (e: Event) => void;
  onkeydown?: (e: KeyboardEvent) => void;
}

export function el(
  tag: string,
  props: ElProps = {},
  ...children: Child[]
): HTMLElement {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.type) node.setAttribute("type", props.type);
  if (props.value !== undefined) (node as HTMLInputElement).value = props.value;
  if (props.placeholder) node.setAttribute("placeholder", props.placeholder);
  if (props.href) node.setAttribute("href", props.href);
  if (props.src) node.setAttribute("src", props.src);
  if (props.alt !== undefined) node.setAttribute("alt", props.alt);
  if (props.role) node.setAttribute("role", props.role);
  if (props.name) node.setAttribute("name", props.name);
  if (props.for) node.setAttribute("for", props.for);
  if (props.ariaLabel) node.setAttribute("aria-label", props.ariaLabel);
  if (props.ariaLive) node.setAttribute("aria-live", props.ariaLive);
  if (props.ariaHidden) node.setAttribute("aria-hidden", props.ariaHidden);
  if (props.style) node.setAttribute("style", props.style);
  if (props.disabled) (node as HTMLButtonElement).disabled = true;
  if (props.checked) (node as HTMLInputElement).checked = true;
  if (props.dataset)
    for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.onclick) node.addEventListener("click", props.onclick);
  if (props.onchange) node.addEventListener("change", props.onchange);
  if (props.oninput) node.addEventListener("input", props.oninput);
  if (props.onkeydown)
    node.addEventListener("keydown", props.onkeydown as EventListener);
  for (const child of children) appendChild(node, child);
  return node;
}

function appendChild(node: HTMLElement, child: Child): void {
  if (child === false || child === null || child === undefined) return;
  if (typeof child === "string" || typeof child === "number") {
    node.appendChild(document.createTextNode(String(child)));
  } else {
    node.appendChild(child);
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(root: HTMLElement, ...children: Child[]): void {
  clear(root);
  for (const c of children) appendChild(root, c);
}
