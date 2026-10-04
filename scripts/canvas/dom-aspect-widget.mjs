import { AspectStorage } from "../helpers/aspect-storage.js";

export class DomAspectWidget {
    constructor(placement, aspect, tags) {
        this.placement = placement;
        this.id = placement.id;
        this.aspectId = placement.aspectId;
        this.aspect = aspect;
        this.tags = tags;
        this.element = null;
        this._createElement();
        this._updatePosition();
        this._bindEvents();
    }

    _createElement() {
        const w = this.placement.width ?? 220;
        const h = this.placement.height ?? 0;
        const el = document.createElement("div");
        el.className = "fatex-dom-aspect-widget";
        el.dataset.placementId = this.id;
        el.dataset.aspectId = this.aspectId || this.id;
        const bg = this.aspect.color || "#4a4a4a";

        el.style.cssText = `position:absolute; width:${w}px; min-height:56px; background:${bg}; border:2px solid rgba(255,255,255,0.9); border-radius:10px; box-shadow:0 4px 18px rgba(0,0,0,0.32); display:flex; flex-direction:column; padding:8px 10px; cursor:grab; user-select:none; overflow:hidden;`;
        if (h) el.style.height = `${h}px`;
        else el.style.height = "auto";

        const fontFamily = getComputedStyle(document.body).getPropertyValue("--font-primary") || "Signika, sans-serif";
        const showTags = game.settings.get("fatex-extras", "sceneDrawingShowTags") ?? true;
        const showInvokes = game.settings.get("fatex-extras", "sceneDrawingShowInvokes") ?? true;
        const showHostile = game.settings.get("fatex-extras", "sceneDrawingShowHostile") ?? true;
        const compact = game.settings.get("fatex-extras", "sceneDrawingCompactInvokes") ?? false;

        let invokesText = "";
        if (showInvokes || showHostile) {
            if (compact) {
                const f = this.aspect.invokes ? "+".repeat(this.aspect.invokes) : "";
                const hv = this.aspect.hostileInvokes ? "-".repeat(this.aspect.hostileInvokes) : "";
                if (f && hv) invokesText = `${f} | ${hv}`;
                else if (f) invokesText = f;
                else if (hv) invokesText = hv;
            } else {
                const invLbl = game.i18n.localize("FAx.Global.Invokes");
                const hosLbl = game.i18n.localize("FAx.Global.HostileInvokes");
                if (showInvokes && showHostile) invokesText = `${invLbl}: ${this.aspect.invokes || 0} | ${hosLbl}: ${this.aspect.hostileInvokes || 0}`;
                else if (showInvokes) invokesText = `${invLbl}: ${this.aspect.invokes || 0}`;
                else invokesText = `${hosLbl}: ${this.aspect.hostileInvokes || 0}`;
            }
        }

        const tagsHtml = (showTags && this.tags.length)
            ? `<div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center; margin:4px 0;">${this.tags.map(t => `<span style="background:${t.color || "#7a7a7a"}; color:white; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:700;">${t.label}</span>`).join("")}</div>`
            : "";

        const invokesHtml = invokesText ? `<div style="text-align:center; font-size:11px; font-weight:700; color:white; opacity:0.95; margin-top:4px;">${invokesText}</div>` : "";


        el.innerHTML = `
            <div style="text-align:center; font-family:${fontFamily}; font-size:15px; font-weight:800; color:white; word-wrap:break-word; line-height:1.25; text-shadow:0 1px 2px rgba(0,0,0,0.3);">${this.aspect.name || " "}</div>
            ${tagsHtml}
            ${invokesHtml}
            <div class="fatex-dom-handles" style="position:absolute; inset:0; pointer-events:none;"></div>
            <div class="fatex-dom-delete" title="Remove from scene" style="position:absolute; left:50%; top:-12px; transform:translateX(-50%); width:20px; height:14px; background:#b83636; border:1px solid white; border-radius:3px; display:none; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; box-shadow:0 1px 4px rgba(0,0,0,0.3);"><span style="color:white; font-size:10px; font-weight:800; line-height:14px;">×</span></div>
        `;

        const handlePos = [
            { name: "tl", left: "-6px", top: "-6px", cursor: "nwse-resize" },
            { name: "tr", left: "auto", right: "-6px", top: "-6px", cursor: "nesw-resize" },
            { name: "bl", left: "-6px", bottom: "-6px", top: "auto", cursor: "nesw-resize" },
            { name: "br", right: "-6px", bottom: "-6px", left: "auto", top: "auto", cursor: "nwse-resize" },
            { name: "t", left: "50%", top: "-6px", cursor: "ns-resize" },
            { name: "b", left: "50%", bottom: "-6px", top: "auto", cursor: "ns-resize" },
            { name: "l", left: "-6px", top: "50%", cursor: "ew-resize" },
            { name: "r", right: "-6px", top: "50%", left: "auto", cursor: "ew-resize" },
        ];
        const handlesContainer = el.querySelector(".fatex-dom-handles");
        for (const p of handlePos) {
            const hdl = document.createElement("div");
            hdl.dataset.handle = p.name;
            const isCorner = p.name.length === 2;
            const wH = isCorner ? "10px" : (p.name === "t" || p.name === "b" ? "28px" : "10px");
            const hH = isCorner ? "10px" : (p.name === "t" || p.name === "b" ? "10px" : "28px");
            hdl.style.cssText = `position:absolute; width:${wH}; height:${hH}; background:rgba(255,255,255,0.92); border:1px solid rgba(0,0,0,0.35); border-radius:2px; cursor:${p.cursor}; pointer-events:auto; display:none;`;
            if (p.left !== undefined) hdl.style.left = p.left;
            if (p.right !== undefined) hdl.style.right = p.right;
            if (p.top !== undefined) hdl.style.top = p.top;
            if (p.bottom !== undefined) hdl.style.bottom = p.bottom;
            if (p.name === "t" || p.name === "b") hdl.style.transform = "translateX(-50%)";
            if (p.name === "l" || p.name === "r") hdl.style.transform = "translateY(-50%)";
            handlesContainer.appendChild(hdl);
        }

        this.element = el;
        this._handlesContainer = handlesContainer;
        this._deleteBtn = el.querySelector(".fatex-dom-delete");
    }

    _updatePosition() {



        const w = this.element.offsetWidth || (this.placement.width ?? 220);
        const h = this.element.offsetHeight || 56;
        let screen = null;
        try {
            if (canvas.canvasCoordinatesFromClient) {

                if (canvas.clientCoordinatesFromCanvas) {
                    screen = canvas.clientCoordinatesFromCanvas({ x: this.placement.x, y: this.placement.y });
                } else {
                    const t = canvas.stage.worldTransform;
                    const viewRect = canvas.app.view.getBoundingClientRect();
                    screen = { x: viewRect.left + this.placement.x * t.a + t.tx, y: viewRect.top + this.placement.y * t.d + t.ty };
                }
            }
        } catch {}
        if (screen) {
            this.element.style.left = `${screen.x - w/2}px`;
            this.element.style.top = `${screen.y - h/2}px`;
        } else {

            this.element.style.left = `${this.placement.x - w/2}px`;
            this.element.style.top = `${this.placement.y - h/2}px`;
        }
    }

    refresh(aspect, tags) {
        this.aspect = aspect;
        this.tags = tags;

        const w = this.element.style.width;
        const h = this.element.style.height;
        const x = this.placement.x;
        const y = this.placement.y;

        const oldW = this.placement.width;
        const oldH = this.placement.height;
        this._createElement();
        this.placement.width = oldW;
        this.placement.height = oldH;
        if (oldW) this.element.style.width = `${oldW}px`;
        if (oldH) this.element.style.height = `${oldH}px`;
        this.placement.x = x;
        this.placement.y = y;
        this._updatePosition();
        this._bindEvents();
    }

    _bindEvents() {

        this.element.addEventListener("pointerenter", () => {
            this.element.querySelectorAll(".fatex-dom-handles div").forEach(h => h.style.display = "block");
            if (this._deleteBtn) this._deleteBtn.style.display = "flex";
            this.element.style.boxShadow = "0 6px 24px rgba(0,0,0,0.38)";
        });
        this.element.addEventListener("pointerleave", () => {
            if (this._dragging || this._resizing) return;
            this.element.querySelectorAll(".fatex-dom-handles div").forEach(h => h.style.display = "none");
            if (this._deleteBtn) this._deleteBtn.style.display = "none";
            this.element.style.boxShadow = "0 4px 18px rgba(0,0,0,0.32)";
        });

        this.element.querySelectorAll(".fatex-dom-handles div").forEach(h => h.style.display = "none");
        if (this._deleteBtn) this._deleteBtn.style.display = "none";


        let startX, startY, startWorldX, startWorldY;
        const onPointerDown = (e) => {
            if (e.target.closest(".fatex-dom-handles") || e.target.closest(".fatex-dom-delete")) return;
            if (e.button !== 0) return;
            if (!this._canEdit()) return;
            e.preventDefault();
            e.stopPropagation();
            const world = this._screenToWorld(e.clientX, e.clientY);
            if (!world) return;
            this._dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startWorldX = this.placement.x;
            startWorldY = this.placement.y;
            this.element.style.cursor = "grabbing";
            this.element.style.zIndex = "20";
            const onMove = (ev) => {
                if (!this._dragging) return;
                const curWorld = this._screenToWorld(ev.clientX, ev.clientY);
                if (!curWorld) return;
                const startWorld = this._screenToWorld(startX, startY);
                if (!startWorld) return;
                const dx = curWorld.x - startWorld.x;
                const dy = curWorld.y - startWorld.y;
                this.placement.x = startWorldX + dx;
                this.placement.y = startWorldY + dy;

                const dims = canvas.dimensions;
                const w = this.element.offsetWidth;
                const h = this.element.offsetHeight;
                this.placement.x = Math.max(w/2, Math.min(dims.width - w/2, this.placement.x));
                this.placement.y = Math.max(h/2, Math.min(dims.height - h/2, this.placement.y));
                this._updatePosition();
            };
            const onUp = async () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                this._dragging = false;
                this.element.style.cursor = "grab";
                this.element.style.zIndex = "10";
                await this._savePosition();
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, { once: true });
        };
        this.element.addEventListener("pointerdown", onPointerDown);


        this.element.querySelectorAll(".fatex-dom-handles div").forEach(hdl => {
            hdl.addEventListener("pointerdown", (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                if (!this._canEdit()) return;
                const handle = hdl.dataset.handle;
                this._resizing = handle;
                startX = e.clientX;
                startY = e.clientY;
                const startW = this.element.offsetWidth;
                const startH = this.element.offsetHeight;
                const startWorldX = this.placement.x;
                const startWorldY = this.placement.y;
                this.element.style.zIndex = "20";
                const onMove = (ev) => {
                    const dxScreen = ev.clientX - startX;
                    const dyScreen = ev.clientY - startY;

                    const scale = canvas.stage.scale.x || 1;
                    const dx = dxScreen / scale;
                    const dy = dyScreen / scale;
                    let newW = startW;
                    let newH = startH;
                    let newX = startWorldX;
                    let newY = startWorldY;
                    if (handle.includes("r")) { newW = Math.max(100, startW + dx); newX = startWorldX + dx/2; }
                    if (handle.includes("l")) { newW = Math.max(100, startW - dx); newX = startWorldX + dx/2; }
                    if (handle.includes("b")) { newH = Math.max(40, startH + dy); newY = startWorldY + dy/2; }
                    if (handle.includes("t")) { newH = Math.max(40, startH - dy); newY = startWorldY + dy/2; }
                    this.element.style.width = `${newW}px`;
                    this.element.style.height = newH ? `${newH}px` : "auto";
                    this.placement.width = newW;
                    this.placement.height = newH;
                    this.placement.x = newX;
                    this.placement.y = newY;
                    this._updatePosition();
                };
                const onUp = async () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    this._resizing = false;
                    this.element.style.zIndex = "10";
                    await this._savePlacement();
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp, { once: true });
            });
        });


        if (this._deleteBtn) {
            this._deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await this._onDeleteClick(e);
            });
            this._deleteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
        }


        this.element.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._onRightClick(e);
        });

        this.element.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this._openManager();
        });
    }

    _canEdit() {
        if (game.user.isGM) return true;
        if (this.placement?.source === "character" && this.placement?.actorId) {
            const actor = game.actors.get(this.placement.actorId);
            if (actor?.isOwner) return true;
        }
        return false;
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

    async _savePosition() {
        const storage = await AspectStorage.getStorage();
        if (!storage) return;
        const placements = foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS) || []);
        const p = placements.find(pl => pl.id === this.id);
        if (!p) return;
        p.x = this.placement.x;
        p.y = this.placement.y;
        await storage.setFlag("fatex-extras", AspectStorage.FLAGS.PLACEMENTS, placements);
        game.socket.emit("module.fatex-extras", { action: "REFRESH_WIDGETS" });
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

    _onRightClick(e) {
        e.preventDefault?.();
        const layer = canvas.aspects;
        if (layer?._showWidgetContextMenu) layer._showWidgetContextMenu(this, e);
    }

    async _onDeleteClick(e) {
        if (!this._canEdit()) {
            ui.notifications.warn(game.i18n.localize("FAx.Global.CannotDeleteStorage"));
            return;
        }
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("FAx.Global.DeleteAspectTitle") || "Delete Aspect",
            content: `<p>${game.i18n.localize("FAx.Global.DeleteAspectConfirm") || "Delete this aspect from the scene?"}</p>`,
            defaultYes: false
        });
        if (!confirmed) return;
        const layer = canvas.aspects;
        if (layer?.deletePlacement) await layer.deletePlacement(this.id);
    }

    _openManager() {
        if (this.placement?.source === "manager") {
            if (typeof globalThis.openAspectManager === "function") globalThis.openAspectManager();
            return;
        }
        if (this.placement?.source === "character" && this.placement?.actorId) {
            const actor = game.actors.get(this.placement.actorId);
            if (actor) { actor.sheet.render(true); return; }
        }
        if (typeof globalThis._openAspectManagerGlobal === "function") globalThis._openAspectManagerGlobal(this.aspectId);
        else import("../apps/scene-aspects.js").then(({ SceneAspectsApp: App }) => new App({ focusAspectId: this.aspectId }).render(true));
    }

    destroy() {
        this.element.remove();
    }
}
