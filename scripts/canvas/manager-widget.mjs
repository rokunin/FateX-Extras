import { AspectStorage } from "../helpers/aspect-storage.js";
import { SceneAspectsApp } from "../apps/scene-aspects.js";

export class ManagerCanvasWidget {
    constructor(placement) {
        this.placement = placement;
        this.id = placement.id;
        this.element = null;
        this._dragging = false;
        this._resizing = false;
        this._dragOffset = { x: 0, y: 0 };
        this._resizeStart = null;
        this._app = null;
        this._lastSignature = null;
        this._createElement();
        this._bindEvents();
        this._updatePosition();
    }

    _createElement() {
        const w = this.placement.width ?? 540;
        const h = this.placement.height ?? 640;
        const el = document.createElement("div");
        el.className = "fatex-manager-widget";
        el.dataset.placementId = this.id;
        el.style.cssText = `position:absolute; width:${w}px; height:${h}px; background: var(--color-bg-option, #f1f2f6); border:1px solid rgba(0,0,0,0.18); border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,0.38); display:flex; flex-direction:column; overflow:hidden; z-index:10; pointer-events:auto;`;
        el.innerHTML = `
            <div class="fatex-manager-widget__header" style="flex:0 0 38px; display:flex; align-items:center; justify-content:space-between; padding:7px 12px; background:#2f3542; color:white; cursor:grab; user-select:none; font-weight:700; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="display:flex; align-items:center; gap:7px;"><i class="fas fa-book-open"></i> ${game.i18n.localize("FAx.Global.ManageAspects")}</span>
                <span style="display:flex; gap:4px; align-items:center;">
                    <a class="fatex-manager-widget__popout" title="Pop out to window" style="color:white; opacity:0.9; cursor:pointer; padding:4px 7px; border-radius:4px; background:rgba(255,255,255,0.10);"><i class="fas fa-external-link-alt"></i></a>
                    <a class="fatex-manager-widget__close" title="Remove from scene" style="color:white; opacity:0.9; cursor:pointer; padding:4px 7px; border-radius:4px; background:rgba(255,255,255,0.10);"><i class="fas fa-times"></i></a>
                </span>
            </div>
            <div class="fatex-manager-widget__body fatex fatex-extras-app" style="flex:1; overflow:auto; background: var(--color-bg-option, #f1f2f6); padding:0;"></div>
            <div class="fatex-manager-widget__resize" style="position:absolute; right:3px; bottom:3px; width:18px; height:18px; cursor:nwse-resize; opacity:0.55; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.85); border:1px solid rgba(0,0,0,0.12); border-radius:3px;"><i class="fas fa-expand-alt" style="font-size:10px; color:#555;"></i></div>
        `;
        this.element = el;

        this._app = new SceneAspectsApp({ popOut: false });

        this._app.close = () => {};

        const body = el.querySelector(".fatex-manager-widget__body");

        this._renderAppIntoBody(body);

        el.querySelector(".fatex-manager-widget__popout").addEventListener("click", (e) => {
            e.stopPropagation();
            new SceneAspectsApp().render(true);
        });
        el.querySelector(".fatex-manager-widget__close").addEventListener("click", async (e) => {
            e.stopPropagation();
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("FAx.Manager.RemoveManager") || "Remove Manager",
                content: `<p>${game.i18n.localize("FAx.Manager.RemoveConfirm") || "Remove this manager from the scene? Aspects stay in the journal."}</p>`,
                defaultYes: false
            });
            if (!confirmed) return;
            const storage = await AspectStorage.getStorage();
            if (!storage) return;
            let placements = foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS) || []);
            placements = placements.filter(p => p.id !== this.id);
            await storage.setFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS, placements);
            game.socket.emit("module.fatex-extras", { action: "REFRESH_WIDGETS" });
            canvas.aspects?.refreshWidgets?.();

            document.querySelectorAll(`.fatex-manager-widget[data-placement-id="${this.id}"]`).forEach(n => n.remove());
        });
    }

    _captureScroll(root) {
        const snaps = [];
        if (root.scrollTop) snaps.push({ path: ":root", top: root.scrollTop });
        const visit = (el, path) => {
            if (el.scrollTop) snaps.push({ path, top: el.scrollTop });
            Array.from(el.children).forEach((child, i) => visit(child, `${path}>${child.tagName}:nth-child(${i + 1})`));
        };
        Array.from(root.children).forEach((child, i) => visit(child, `${child.tagName}:nth-child(${i + 1})`));
        return snaps;
    }

    _restoreScroll(root, snaps) {
        for (const s of snaps) {
            let el;
            if (s.path === ":root") el = root;
            else { try { el = root.querySelector(s.path); } catch { el = undefined; } }
            if (!el) continue;
            el.scrollTop = Math.min(s.top, Math.max(0, el.scrollHeight - el.clientHeight));
        }
    }

    async _renderAppIntoBody(container) {
        try {
            const data = await this._app.getData();
            const renderFn = foundry?.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
            const html = await renderFn(this._app.constructor.defaultOptions.template, data);
            const scrollSnaps = this._captureScroll(container);
            container.innerHTML = html;
            const restoreScroll = () => {
                if (!container.isConnected) return;
                this._restoreScroll(container, scrollSnaps);
            };
            restoreScroll();
            const $html = $(container);

            const $innerHeader = $html.find(".fatex-header");
            if ($innerHeader.length) {
                const $innerActions = $innerHeader.find(".fatex-header__actions");
                const $widgetHeaderActions = $(this.element).find(".fatex-manager-widget__header span").last();
                if ($innerActions.length && $widgetHeaderActions.length) {

                    $(this.element).find(".fatex-manager-widget__header .fatex-cloned-action").remove();


                    $innerActions.children().not(".place-on-canvas").each((_, el) => {
                        const $btn = $(el).clone(true);
                        $btn.addClass("fatex-cloned-action");
                        $btn.css({ color: "white", opacity: "0.9", cursor: "pointer", padding: "4px 7px" });
                        $widgetHeaderActions.prepend($btn);

                        $btn.on("click", (e) => {
                            const orig = $innerHeader.find(`[class*="${el.className.split(' ')[0]}"]`).first();
                            if (orig.length) orig.trigger("click");
                            else $(el).trigger("click");
                        });
                    });
                }
                $innerHeader.hide();
            }


            const origElement = this._app.element;
            const origJq = this._app._element;
            try {

                this._app.activateListeners($html);
            } catch (e) {
                console.warn("FateX Extras | activateListeners failed, falling back", e);

                $html.find(".create-aspect, .create-group, .manage-tags, .invoke-control, .aspect-color-trigger, .aspect-visibility, .aspect-delete").each((_, el) => {
                    el.addEventListener("click", (ev) => ev.stopPropagation());
                });
            }

            try {
                if (this._app._dragDrop) {
                    for (const dd of this._app._dragDrop) {

                        dd.bind?.(container);
                    }
                }
            } catch {}
            restoreScroll();
            requestAnimationFrame(restoreScroll);
        } catch (e) {
            console.error("FateX Extras | Manager widget render failed", e);
            container.innerHTML = `<div style="padding:20px; color:#a00;">Failed to render manager: ${e.message}</div>`;
        }
    }

    async refresh() {
        const body = this.element?.querySelector(".fatex-manager-widget__body");
        if (!body) return;


        if (window.__fatexDragActive || document.querySelectorAll(".window-app.dragging, .placeable.dragging, .drag-selected").length) {
            if (window.__fatexDragActive && !this._dragRefreshQueued) {
                this._dragRefreshQueued = true;
                document.addEventListener("dragend", () => {
                    this._dragRefreshQueued = false;
                    this.refresh();
                }, { once: true });
            }
            return;
        }
        const data = await this._app.getData?.();
        if (data) {
            const signature = JSON.stringify({
                g: (data.groups || []).map(x => ({ i: x.id, l: x.label, c: !!x.collapsed, k: x.aspects.map(a => a.id + a.name + (a.tagIds || []).join("+") + (a.hidden ? "h" : "")).join(",") })),
                t: (data.globalTags || []).map(x => x.id + x.label + (x.color || ""))
            });
            if (signature === this._lastSignature) return;
            this._lastSignature = signature;
        }
        await this._renderAppIntoBody(body);
    }

    _currentScale() {
        try {
            return canvas.scene?._viewPosition?.scale ?? canvas.stage.scale.x ?? 1;
        } catch {
            return 1;
        }
    }

    _bindEvents() {
        const header = this.element.querySelector(".fatex-manager-widget__header");
        const resize = this.element.querySelector(".fatex-manager-widget__resize");
        let startX, startY, startWorld, startW, startH, startLeft, startTop, startVisW, startVisH, resizeScale;

        const onHeaderDown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest(".fatex-manager-widget__close") || e.target.closest(".fatex-manager-widget__popout") || e.target.closest(".fatex-cloned-action")) return;
            e.preventDefault();
            this._dragging = true;
            const scale = this._currentScale();
            startX = e.clientX;
            startY = e.clientY;
            startWorld = { x: this.placement.x, y: this.placement.y };
            this.element.style.cursor = "grabbing";
            this.element.style.zIndex = "20";
            header.style.cursor = "grabbing";
            const onMove = (ev) => {
                if (!this._dragging) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                this.placement.x = startWorld.x + dx / scale;
                this.placement.y = startWorld.y + dy / scale;
                this._updatePosition();
            };
            const onUp = async () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                this._dragging = false;
                this.element.style.cursor = "";
                header.style.cursor = "grab";
                this.element.style.zIndex = "10";
                await this._savePlacement();
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, { once: true });
        };
        header.addEventListener("pointerdown", onHeaderDown);

        const onResizeDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            this._resizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseFloat(this.element.style.left) || 0;
            startTop = parseFloat(this.element.style.top) || 0;
            startW = this.element.offsetWidth || this.placement.width;
            startH = this.element.offsetHeight || this.placement.height;
            resizeScale = this._currentScale() || 1;


            startVisW = startW * resizeScale;
            startVisH = startH * resizeScale;
            this.element.style.zIndex = "20";
            const onMove = (ev) => {
                if (!this._resizing) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                const newVisW = startVisW + dx;
                const newVisH = startVisH + dy;
                const worldW = Math.max(newVisW / resizeScale, 40);
                const worldH = Math.max(newVisH / resizeScale, 40);



                const dW = newVisW - startVisW;
                const dH = newVisH - startVisH;
                this.element.style.width = `${worldW}px`;
                this.element.style.height = `${worldH}px`;
                this.element.style.left = `${startLeft - ((1 - resizeScale) * dW) / (2 * resizeScale)}px`;
                this.element.style.top = `${startTop - ((1 - resizeScale) * dH) / (2 * resizeScale)}px`;
                this.placement.width = worldW;
                this.placement.height = worldH;
            };
            const onUp = async () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                this._resizing = false;
                this.element.style.zIndex = "10";


                const cx = parseFloat(this.element.style.left) + this.element.offsetWidth / 2;
                const cy = parseFloat(this.element.style.top) + this.element.offsetHeight / 2;
                const pt = this._screenToWorld(cx, cy);
                if (pt) {
                    this.placement.x = pt.x;
                    this.placement.y = pt.y;
                }
                await this._savePlacement();
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, { once: true });
        };
        resize.addEventListener("pointerdown", onResizeDown);
    }

    _screenToWorld(screenX, screenY) {
        try {
            if (canvas.canvasCoordinatesFromClient) {
                const p = canvas.canvasCoordinatesFromClient({ x: screenX, y: screenY });
                if (p) return p;
            }

            const t = canvas.stage.worldTransform;
            return { x: (screenX - t.tx) / t.a, y: (screenY - t.ty) / t.d };
        } catch { return null; }
    }

    _worldToScreen(worldX, worldY) {
        try {
            if (canvas.clientCoordinatesFromCanvas) {
                const p = canvas.clientCoordinatesFromCanvas({ x: worldX, y: worldY });
                if (p) return p;
            }
            const t = canvas.stage.worldTransform;
            return { x: worldX * t.a + t.tx, y: worldY * t.d + t.ty };
        } catch {

            const rect = canvas.app.view.getBoundingClientRect();
            const screen = canvas.worldTransform.apply({ x: worldX, y: worldY });
            return { x: rect.left + screen.x, y: rect.top + screen.y };
        }
    }

    _updatePosition() {
        const screen = this._worldToScreen(this.placement.x, this.placement.y);
        if (!screen) return;
        const w = this.element.offsetWidth || this.placement.width;
        const h = this.element.offsetHeight || this.placement.height;
        const s = this._currentScale() || 1;





        this.element.style.transformOrigin = "center center";
        this.element.style.transform = `scale(${s})`;
        this.element.style.left = `${screen.x - w/2}px`;
        this.element.style.top = `${screen.y - h/2}px`;
    }

    focusAspect(aspectId) {
        if (!aspectId) return;
        const apply = () => {
            const body = this.element?.querySelector(".fatex-manager-widget__body");
            if (!body) return false;
            const target = body.querySelector(`.fatex-scene-aspect[data-id="${CSS.escape(aspectId)}"]`);
            if (!target) return false;
            target.closest(".fatex-group-content")?.classList?.remove("is-collapsed");
            const collapse = target.closest(".fatex-aspect-group")?.querySelector(".fatex-group-header .group-collapse");
            if (collapse) {
                collapse.classList.remove("fa-chevron-right");
                collapse.classList.add("fa-chevron-down");
            }
            const scroller = target.closest(".fatex-desk__content") || body;
            const tRect = target.getBoundingClientRect();
            const sRect = scroller.getBoundingClientRect();
            scroller.scrollTop += (tRect.top - sRect.top) - (sRect.height - tRect.height) / 2;
            target.classList.remove("fatex-focus");
            void target.offsetWidth;
            target.classList.add("fatex-focus");
            clearTimeout(this._focusTimer);
            this._focusTimer = setTimeout(() => target.classList.remove("fatex-focus"), 2600);
            return true;
        };
        if (!apply()) this.refresh().then(apply).catch(() => {});
    }

    async _savePlacement() {
        const storage = await AspectStorage.getStorage();
        if (!storage) return;
        const placements = foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS) || []);
        const p = placements.find(pl => pl.id === this.id);
        if (!p) return;
        p.x = this.placement.x;
        p.y = this.placement.y;
        p.width = this.element.offsetWidth;
        p.height = this.element.offsetHeight;
        await storage.setFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS, placements);
        game.socket.emit("module.fatex-extras", { action: "REFRESH_WIDGETS" });
    }

    destroy() {
        this.element.remove();
    }
}
