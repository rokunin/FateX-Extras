import { SceneAspectsApp } from "./apps/scene-aspects.js";
import { RollModifiers } from "./features/roll-modifiers.js";
import { AspectStorage } from "./helpers/aspect-storage.js";

const MODULE_ID = "fatex-extras";
const SOCKET_NAME = `module.${MODULE_ID}`;

Hooks.on("getSceneControlButtons", (controls) => {
    const mainTool = {
        name: "scene-aspects",
        title: "Aspect Manager",
        icon: "fas fa-book-open",
        visible: true, 
        onClick: () => { new SceneAspectsApp().render(true); },
        button: true
    };

    const findControlGroup = (name) => {
        if (!controls) return null;
        if (Array.isArray(controls)) return controls.find(c => c.name === name);
        if (controls instanceof Map) return controls.get(name) || Array.from(controls.values()).find(c => c.name === name);
        if (typeof controls === "object") {
            if (Array.isArray(controls.controls)) return controls.controls.find(c => c.name === name);
            return controls[name] || Object.values(controls).find(c => c.name === name);
        }
        return null;
    };

    const token = findControlGroup("token") || findControlGroup("tokens");
    if (token) {
        if (!token.tools) token.tools = [];
        if (Array.isArray(token.tools)) {
            if (!token.tools.find(t => t.name === "scene-aspects")) token.tools.push({ ...mainTool });
        } else if (token.tools instanceof Map) {
            if (!token.tools.has("scene-aspects")) token.tools.set("scene-aspects", { ...mainTool });
        } else if (typeof token.tools === "object") {
            if (!token.tools["scene-aspects"]) token.tools["scene-aspects"] = { ...mainTool };
        } else {
             console.warn("FateX Extras | Expected token.tools to be an array, Map or object but got:", typeof token.tools, token.tools);
        }
    }
});

Hooks.once("diceSoNiceReady", (dice3d) => {
    dice3d.addSystem({ id: "fatex-extras", name: game.i18n.localize("FAx.Dice.SystemName") }, "default");
    dice3d.addDicePreset({
        type: "dc",
        labels: ["", ""], 
        modelFile: "modules/fatex-extras/assets/dc_die.glb",
        system: "fatex-extras"
    });
});

Hooks.once("init", () => {
    game.settings.register("fatex-extras", "darkMode", {
        name: game.i18n.localize("FAx.Settings.DarkMode"),
        hint: game.i18n.localize("FAx.Settings.DarkModeHint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: value => {
            if (value) document.body.classList.add("fatex-dark-mode");
            else document.body.classList.remove("fatex-dark-mode");
        }
    });
    
    game.settings.register("fatex-extras", "sceneDrawingFont", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingFont"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingFontHint"),
        scope: "world",
        config: true,
        type: String,
        default: "Signika",
        choices: {
            "Signika": "Signika",
            "Roboto": "Roboto", 
            "Roboto Condensed": "Roboto Condensed",
            "Arial": "Arial",
            "Georgia": "Georgia",
            "Times New Roman": "Times New Roman"
        }
    });
    
    game.settings.register("fatex-extras", "sceneDrawingBgAlpha", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingBgAlpha"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingBgAlphaHint"),
        scope: "world",
        config: true,
        type: Number,
        default: 1,
        range: { min: 0, max: 1, step: 0.1 }
    });
    
    game.settings.register("fatex-extras", "sceneDrawingShowTags", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingShowTags"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingShowTagsHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
    
    game.settings.register("fatex-extras", "sceneDrawingShowHostile", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingShowHostile"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingShowHostileHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
    
    game.settings.register("fatex-extras", "sceneDrawingShowInvokes", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingShowInvokes"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingShowInvokesHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
    
    game.settings.register("fatex-extras", "sceneDrawingStrokeColor", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingStrokeColor"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingStrokeColorHint"),
        scope: "world",
        config: true,
        type: new foundry.data.fields.ColorField({ nullable: false }),
        default: "#ffffff"
    });
    
    game.settings.register("fatex-extras", "sceneDrawingStrokeAlpha", {
        name: game.i18n.localize("FAx.Settings.SceneDrawingStrokeAlpha"),
        hint: game.i18n.localize("FAx.Settings.SceneDrawingStrokeAlphaHint"),
        scope: "world",
        config: true,
        type: Number,
        default: 0.3,
        range: { min: 0, max: 1, step: 0.1 }
    });
    
    game.settings.register("fatex-extras", "koFiDismissed", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });
    
    game.settings.register("fatex-extras", "showKoFiMessage", {
        name: game.i18n.localize("FAx.KoFi.ShowMessage"),
        hint: game.i18n.localize("FAx.KoFi.ShowMessageHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    RollModifiers.init();
});

function _onDocumentDragOver(event) {
    try {
        const data = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
        if (data.type === "SceneAspect") {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        }
    } catch (e) {}
}

async function _onDocumentDrop(event) {
    if (!game.user.isGM) return;
    
    try {
        const data = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
        if (data.type !== "SceneAspect") return;
        
        if (!canvas?.ready || !game.scenes.active) return;
        
        const dropTarget = event.target;
        const isOnCanvas = dropTarget === canvas.app.view || 
                          dropTarget.closest?.('#board') || 
                          dropTarget.classList?.contains('board') ||
                          (canvas.app.view && canvas.app.view.contains(dropTarget));
        
        if (!isOnCanvas) return;
        
        const storage = await AspectStorage.getStorage();
        if (!storage) return;
        
        const aspects = storage.getFlag("fatex-extras", "sceneAspects") || [];
        const aspect = aspects.find(a => a.id === data.id);
        if (!aspect) return;
        
        const rect = canvas.app.view.getBoundingClientRect();
        const x = (event.clientX - rect.left) / canvas.stage.scale.x;
        const y = (event.clientY - rect.top) / canvas.stage.scale.y;
        
        const { mainDrawing } = await _createAspectDrawingData(aspect, x, y);
        
        await game.scenes.active.createEmbeddedDocuments("Drawing", [mainDrawing]);
        
        ui.notifications.info(game.i18n.format("FAx.Global.AspectAddedToScene", { name: aspect.name }));
    } catch (e) {
        console.error("FateX Extras | Error creating aspect drawing:", e);
    }
}

async function _createAspectDrawingData(aspect, x, y) {
    const tags = aspect.tagIds || [];
    const storage = await AspectStorage.getStorage();
    const allTags = storage ? storage.getFlag("fatex-extras", "sceneAspectTags") || [] : [];
    const aspectTags = tags.map(tid => allTags.find(t => t.id === tid)).filter(Boolean);
    
    const showTags = game.settings.get("fatex-extras", "sceneDrawingShowTags") ?? true;
    const showInvokes = game.settings.get("fatex-extras", "sceneDrawingShowInvokes") ?? true;
    const showHostile = game.settings.get("fatex-extras", "sceneDrawingShowHostile") ?? true;
    
    const tagsText = (showTags && aspectTags.length > 0) ? `[${aspectTags.map(t => t.label).join(' | ')}]` : '';
    
    let invokesLine = '';
    if (showInvokes || showHostile) {
        const invokesLabel = game.i18n.localize("FAx.Global.Invokes");
        const hostileLabel = game.i18n.localize("FAx.Global.HostileInvokes");
        
        if (showInvokes && showHostile) {
            invokesLine = `${invokesLabel}: ${aspect.invokes || 0} | ${hostileLabel}: ${aspect.hostileInvokes || 0}`;
        } else if (showInvokes) {
            invokesLine = `${invokesLabel}: ${aspect.invokes || 0}`;
        } else {
            invokesLine = `${hostileLabel}: ${aspect.hostileInvokes || 0}`;
        }
    }
    
    const text = aspect.name + (tagsText ? '\n' + tagsText : '') + (invokesLine ? '\n' + invokesLine : '');
    
    const width = Math.max(200, Math.max(aspect.name.length, tagsText.length, invokesLine.length) * 10);
    const height = (showTags && aspectTags.length > 0) ? 100 : 70;
    const bgColor = aspect.color || "#4a4a4a";
    const fontSize = Math.min(64, Math.max(10, Math.round(height * 0.18)));
    const fontFamily = game.settings.get("fatex-extras", "sceneDrawingFont") || "Signika";
    const bgAlpha = game.settings.get("fatex-extras", "sceneDrawingBgAlpha") ?? 1;
    const strokeColorSetting = game.settings.get("fatex-extras", "sceneDrawingStrokeColor");
    let strokeColor = "#ffffff";
    if (strokeColorSetting) {
        if (typeof strokeColorSetting === "string") {
            strokeColor = strokeColorSetting;
        } else if (strokeColorSetting.css) {
            strokeColor = strokeColorSetting.css;
        } else if (strokeColorSetting.toString) {
            strokeColor = strokeColorSetting.toString();
        }
    }
    const strokeAlpha = game.settings.get("fatex-extras", "sceneDrawingStrokeAlpha") ?? 0.3;
    
    const mainDrawing = {
        author: game.user.id,
        type: foundry.data.ShapeData.TYPES.RECTANGLE,
        x: x - width / 2,
        y: y - height / 2,
        shape: {
            type: foundry.data.ShapeData.TYPES.RECTANGLE,
            width: width,
            height: height
        },
        fillType: bgAlpha > 0 ? CONST.DRAWING_FILL_TYPES.SOLID : CONST.DRAWING_FILL_TYPES.NONE,
        fillColor: bgColor,
        fillAlpha: bgAlpha,
        strokeWidth: strokeAlpha > 0 ? 2 : 0,
        strokeColor: strokeColor,
        strokeAlpha: strokeAlpha,
        text: text,
        fontFamily: fontFamily,
        fontSize: fontSize,
        textColor: "#ffffff",
        textAlpha: 1,
        rotation: 0,
        hidden: false,
        locked: false,
        flags: {
            "fatex-extras": {
                isAspectDrawing: true,
                aspectId: aspect.id
            }
        }
    };
    
    return { mainDrawing };
}

document.addEventListener("dragover", _onDocumentDragOver);
document.addEventListener("drop", _onDocumentDrop);

Hooks.on("updateDrawing", async (drawing, changes, options, userId) => {
    if (!drawing.getFlag("fatex-extras", "isAspectDrawing")) return;
    
    const newHeight = drawing.shape?.height;
    
    if (newHeight !== undefined) {
        const fontSize = Math.min(64, Math.max(10, Math.round(newHeight * 0.18)));
        await drawing.update({ fontSize: fontSize });
    }
});

async function _updateAspectDrawings(aspectId) {
    const scene = game.scenes.active;
    if (!scene) return;
    
    const storage = await AspectStorage.getStorage();
    if (!storage) return;
    
    const aspects = storage.getFlag("fatex-extras", "sceneAspects") || [];
    const aspect = aspects.find(a => a.id === aspectId);
    if (!aspect) return;
    
    const allTags = storage.getFlag("fatex-extras", "sceneAspectTags") || [];
    const aspectTags = (aspect.tagIds || []).map(tid => allTags.find(t => t.id === tid)).filter(Boolean);
    
    const showTags = game.settings.get("fatex-extras", "sceneDrawingShowTags") ?? true;
    const showInvokes = game.settings.get("fatex-extras", "sceneDrawingShowInvokes") ?? true;
    const showHostile = game.settings.get("fatex-extras", "sceneDrawingShowHostile") ?? true;
    
    const tagsText = (showTags && aspectTags.length > 0) ? `[${aspectTags.map(t => t.label).join(' | ')}]` : '';
    
    let invokesLine = '';
    if (showInvokes || showHostile) {
        const invokesLabel = game.i18n.localize("FAx.Global.Invokes");
        const hostileLabel = game.i18n.localize("FAx.Global.HostileInvokes");
        
        if (showInvokes && showHostile) {
            invokesLine = `${invokesLabel}: ${aspect.invokes || 0} | ${hostileLabel}: ${aspect.hostileInvokes || 0}`;
        } else if (showInvokes) {
            invokesLine = `${invokesLabel}: ${aspect.invokes || 0}`;
        } else {
            invokesLine = `${hostileLabel}: ${aspect.hostileInvokes || 0}`;
        }
    }
    
    const text = aspect.name + (tagsText ? '\n' + tagsText : '') + (invokesLine ? '\n' + invokesLine : '');
    const fillColor = aspect.color || "#4a4a4a";
    
    const drawings = scene.drawings.filter(d => d.getFlag("fatex-extras", "isAspectDrawing") && d.getFlag("fatex-extras", "aspectId") === aspectId);
    
    for (const drawing of drawings) {
        const height = drawing.shape.height;
        const fontSize = Math.min(64, Math.max(10, Math.round(height * 0.18)));
        
        await drawing.update({ 
            text: text,
            fillColor: fillColor,
            fontSize: fontSize
        });
    }
}

Hooks.on("preDeleteDrawing", async (drawing, options, userId) => {
});

Hooks.once("ready", async () => {
    const FateActor = CONFIG.Actor.documentClass;
    if (FateActor) {
        FateActor.createDialog = async function (data, options = {}) {
            const picker = CONFIG.FateX?.applications?.templatePicker;
            if (picker) {
                if (picker.options && Object.isExtensible(picker.options)) {
                    picker.options.folder = data?.folder;
                }
                return picker.render({ force: true });
            }
        };
    }

    if (game.settings.get("fatex-extras", "darkMode")) {
        document.body.classList.add("fatex-dark-mode");
    }

    await AspectStorage.getStorage();
    hideAspectJournal();
    
    const moduleData = game.modules.get("fatex-extras");
    let koFiUrl = "";
    if (moduleData?.authors) {
        const authorsArray = Array.from(moduleData.authors);
        koFiUrl = authorsArray?.[0]?.url || "";
    }
    const koFiDismissed = game.settings.get("fatex-extras", "koFiDismissed");
    const showKoFi = game.settings.get("fatex-extras", "showKoFiMessage") !== false;
    
    if (game.user.isGM && !koFiDismissed && showKoFi && koFiUrl && koFiUrl.includes("ko-fi")) {
        ChatMessage.create({
            user: game.user.id,
            content: `
                <div style="background: linear-gradient(135deg, #794bc4 0%, #ff5e62 100%); padding: 15px; border-radius: 8px; color: white; font-family: inherit; max-width: 350px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px;">
                        ${game.i18n.localize("FAx.KoFi.SupportMessage")}
                    </p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="${koFiUrl}" target="_blank" style="display: inline-block; background: white; color: #794bc4; padding: 8px 16px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 13px;">
                            Support on Ko-fi
                        </a>
                        <button id="fatex-ko-fi-dismiss" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px;">
                            Don't show again
                        </button>
                    </div>
                </div>
            `
        });
        
        Hooks.on("renderChatMessage", (message, html) => {
            const btn = html.find("#fatex-ko-fi-dismiss");
            if (btn.length) {
                btn.on("click", () => {
                    game.settings.set("fatex-extras", "showKoFiMessage", false);
                    message.delete();
                });
            }
        });
    }
    
    game.socket.on(SOCKET_NAME, async (payload) => {
        if (payload.action === "REFRESH_APPS") {
            refreshApps();
        }
        else if (payload.action === "UPDATE_ASPECT_DRAWINGS") {
            await _updateAspectDrawings(payload.aspectId);
        }
        else if (game.user.isGM) {
            if (payload.action === "UPDATE_CHAT_MESSAGE") {
                const msg = game.messages.get(payload.messageId);
                if (msg) await msg.update(payload.updateData);
            } else if (payload.action === "UPDATE_ACTOR") {
                const actor = game.actors.get(payload.actorId);
                if (actor) await actor.update(payload.updateData);
            } else if (payload.action === "UPDATE_ITEM") {
                const actor = game.actors.get(payload.actorId);
                const item = actor?.items.get(payload.itemId);
                if (item) await item.update(payload.updateData);
            } else if (payload.action === "UPDATE_JOURNAL") {
                const journal = game.journal.get(payload.journalId);
                if (journal) await journal.update(payload.updateData);
            }
        }
    });
});

Hooks.on("preDeleteJournalEntry", (doc, options, userId) => {
    if (doc.getFlag("fatex-extras", "isGlobalAspectStorage")) {
        ui.notifications.warn(game.i18n.localize("FAx.Global.CannotDeleteStorage"));
        return false;
    }
});

Hooks.on("updateItem", (item, change, options, userId) => {
    if (options.fromGlobalSync) return;

    if (item.type !== "aspect" && item.type !== "consequence") return;

    const invokesChanged = change.flags?.["fatex-extras"]?.freeInvokes !== undefined;
    const nameChanged = change.name !== undefined;
    const textChanged = change.system?.value !== undefined;

    if (invokesChanged || nameChanged || textChanged) {
         if (userId === game.user.id) {
             AspectStorage.syncItemToGlobal(item);
         }
    }
});

Hooks.on("updateJournalEntry", async (doc, change, options, userId) => {
    if (!doc.getFlag("fatex-extras", "isGlobalAspectStorage")) return;

    refreshApps();

    const flat = foundry.utils.flattenObject(change);
    const updatesToProcess = new Set();

    for (const key of Object.keys(flat)) {
        if (key.includes("characterInvokes")) {
            const parts = key.split(".");
            const invokesIndex = parts.indexOf("characterInvokes");
            if (invokesIndex !== -1 && parts.length > invokesIndex + 1) {
                const itemId = parts[invokesIndex + 1];
                updatesToProcess.add(itemId);
            }
        }
    }

    if (updatesToProcess.size > 0) {
        const allInvokes = doc.getFlag("fatex-extras", AspectStorage.FLAGS.CHARACTER_INVOKES) || {};

        for (const itemId of updatesToProcess) {
            const data = allInvokes[itemId];
            if (!data) continue; 

            const actorId = data.actorId;
            const actor = game.actors.get(actorId);
            
            if (actor && actor.isOwner) {
                const item = actor.items.get(itemId);
                if (item) {
                    const currentLocal = item.getFlag("fatex-extras", "freeInvokes");
                    if (currentLocal !== data.value) {
                        await item.update({ 
                            "flags.fatex-extras.freeInvokes": data.value 
                        }, { fromGlobalSync: true });
                    }
                }
            }
        }
    }
});

Hooks.on("renderActorSheet", (sheet, html, data) => {
    if (sheet.actor.type !== "character") return;
    const $html = $(html);

    if (sheet.actor.isOwner) {
        const wrapper = $html.find(".fatex-header__fate-points-wrapper");
        if (wrapper.length && wrapper.find(".fatex-js-refresh-fatepoints").length === 0) {
            const refreshBtn = $(`<i class="fas fa-sync-alt fatex-js-refresh-fatepoints" title="${game.i18n.localize("FAx.NewSession.Title")}" style="cursor: pointer; margin-left: 10px; font-size: 14px; color: rgba(255,255,255,0.5); align-self: center; pointer-events: all;"></i>`);
            wrapper.append(refreshBtn);
            refreshBtn.hover(
                function() { $(this).css("color", "rgba(255,255,255,1)"); },
                function() { $(this).css("color", "rgba(255,255,255,0.5)"); }
            );
            refreshBtn.click(async (e) => {
                e.preventDefault(); e.stopPropagation();
                new Dialog({
                    title: game.i18n.localize("FAx.NewSession.Title"),
                    content: `<p>${game.i18n.localize("FAx.NewSession.Question")}</p>`,
                    buttons: {
                        yes: {
                            icon: '<i class="fas fa-check"></i>',
                            label: game.i18n.localize("FAx.NewSession.Confirm"),
                            callback: async () => {
                                const actor = sheet.actor;
                                const fp = actor.system.fatepoints;
                                if (fp.current < fp.refresh) {
                                    const diff = fp.refresh - fp.current;
                                    await actor.update({ "system.fatepoints.current": fp.refresh });
                                    if (game.dice3d) {
                                        const dice = Array.from({length: diff}, () => ({ result: 1, resultLabel: 1, type: "dc", vectors: [], options: {} }));
                                        game.dice3d.show({ throws: [{ dice: dice }], formula: `${dice.length}dc` }, game.user, true);
                                    }
                                    ui.notifications.info(game.i18n.format("FAx.NewSession.Success", { name: actor.name }));
                                } else {
                                    ui.notifications.info(game.i18n.format("FAx.NewSession.AlreadyFull", { name: actor.name }));
                                }
                            }
                        },
                        no: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FAx.NewSession.Cancel") }
                    },
                    default: "yes"
                }).render(true);
            });
        }
    }

    $html.find(".fatex-item, .fatex-js-item").each((i, el) => {
        const itemEl = $(el);
        const itemId = itemEl.attr("data-id") || itemEl.attr("data-item-id");
        if (!itemId) return;

        const item = sheet.actor.items.get(itemId);
        if (!item || (item.type !== "aspect" && item.type !== "consequence")) return;
        
        itemEl.find(".fatex-extras-item-tools").remove();

        const freeInvokes = item.getFlag("fatex-extras", "freeInvokes") || 0;

        const toolsHtml = `
            <div class="fatex-extras-item-tools" style="position: absolute; right: 0; bottom: 0; height: 16px; z-index: 5; display: flex; align-items: center; gap: 5px; pointer-events: none;">
                <div class="character-invoke-counter" style="background: rgba(0,0,0,0.05); padding: 0 5px; border-radius: 5px; display: flex; align-items: center; gap: 3px; height: 16px; pointer-events: all;">
                    <i class="fas fa-minus fatex-extras-invoke-ctrl" data-action="decrease" data-id="${itemId}" style="cursor: pointer; font-size: 8px;"></i>
                    <span class="invoke-value" style="font-size: 10px; font-weight: bold; min-width: 8px; text-align: center; line-height: 16px;">${freeInvokes}</span>
                    <i class="fas fa-plus fatex-extras-invoke-ctrl" data-action="increase" data-id="${itemId}" style="cursor: pointer; font-size: 8px;"></i>
                </div>
            </div>
        `;

        const relativeContainer = itemEl.find(".fatex-u-pos-relative");
        if (relativeContainer.length) {
            relativeContainer.append(toolsHtml);
            const toolsContainer = relativeContainer.find('.fatex-extras-item-tools');
            
            let chatIcon = relativeContainer.find('.fatex-js-item-to-chat');
            if (chatIcon.length === 0 && item.type === "consequence") {
                chatIcon = $(`<i class="fatex-js-item-to-chat fatex-actions__icon fatex-actions__icon--no-hide fa fa-comment" data-item="${itemId}" style="pointer-events: all;"></i>`);
            }

            if (chatIcon.length) {
                toolsContainer.prepend(chatIcon);
                chatIcon.css({
                    'position': 'static', 'height': '16px', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center',
                    'margin': '0', 'font-size': '12px', 'opacity': '1', 'pointer-events': 'all'
                });

                chatIcon.off("click").on("click", ev => {
                    ev.preventDefault(); ev.stopPropagation();
                    const title = item.system.label || game.i18n.localize(item.name);
                    const content = `<div class="fatex-sheet fatex-item-card"><header class="fatex-headline fatex-headline--chat"><h3 class="fatex-headline__text">${title}</h3></header><div class="fatex-item-card__content"><div class="fatex-item-card__description">${item.system.value}</div></div></div>`;
                    ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: content });
                });
            }
        }
    });

    $html.find(".fatex-extras-invoke-ctrl").on("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const btn = $(e.currentTarget);
        const itemId = btn.attr("data-id");
        const action = btn.attr("data-action");
        const item = sheet.actor.items.get(itemId);
        if (!item) return;

        const currentInvokes = item.getFlag("fatex-extras", "freeInvokes") || 0;
        let newInvokes = action === "increase" ? currentInvokes + 1 : Math.max(0, currentInvokes - 1);
        
        if (newInvokes === currentInvokes) return;

        if (game.user.isGM || item.isOwner) {
            await item.setFlag("fatex-extras", "freeInvokes", newInvokes);
        } else {
            game.socket.emit(SOCKET_NAME, {
                action: "UPDATE_ITEM",
                actorId: sheet.actor.id,
                itemId: itemId,
                updateData: { "flags.fatex-extras.freeInvokes": newInvokes }
            });
        }
    });
});

function hideAspectJournal() {
    const journal = game.journal.find(j => j.getFlag("fatex-extras", "isGlobalAspectStorage"));
    if (!journal) return;
    const cssId = "fatex-extras-hide-storage";
    if (!document.getElementById(cssId)) {
        const style = document.createElement("style");
        style.id = cssId;
        style.textContent = `.sidebar-tab.journal-directory [data-document-id="${journal.id}"] { display: none !important; }`;
        document.head.appendChild(style);
    }
}

function refreshApps() {
    Object.values(ui.windows).forEach(w => { if (w instanceof SceneAspectsApp) w.render(); });
}
