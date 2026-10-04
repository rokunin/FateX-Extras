import { AspectStorage } from "../helpers/aspect-storage.js";

export class SceneAspectsApp extends FormApplication {
    constructor(options = {}) {
        super({}, options);
        this.focusAspectId = options.focusAspectId || null;
        this.searchQuery = "";
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "fatex-scene-aspects",
            title: game.i18n.localize("FAx.Global.ManageAspects"),
            template: "modules/fatex-extras/templates/scene-aspects.hbs",
            width: 500,
            height: 600,
            classes: ["fatex", "fatex-extras-app"],
            resizable: true,
            closeOnSubmit: false,
            submitOnChange: false,
            scrollY: [".fatex-desk__content"],
            dragDrop: [
                { dragSelector: ".fatex-scene-aspect, .aspect-tag-pill, .fatex-group-header", dropSelector: ".fatex-desk__aspects" }
            ]
        });
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        if (game.user.isGM) {
            buttons.unshift(
                {
                    label: "",
                    class: "place-on-canvas",
                    icon: "fas fa-map-pin",
                    tooltip: "FAx.Manager.PlacePanel",
                    onclick: () => {}
                },
                {
                    label: "",
                    class: "manage-tags",
                    icon: "fas fa-tags",
                    tooltip: "FAx.Global.ManageTags",
                    onclick: (event) => this._onManageTags(event)
                },
                {
                    label: "",
                    class: "create-group",
                    icon: "fas fa-folder-plus",
                    tooltip: "FAx.Global.CreateGroup",
                    onclick: (event) => this._onCreateGroup(event)
                }
            );
        }
        return buttons;
    }

    _autoResizeTextareas() {
        this.element.find("textarea.aspect-name").each(function() {
            this.style.height = "auto";
            this.style.height = (this.scrollHeight) + "px";
        });
    }

    _onResize(event) {
        super._onResize(event);
        this._autoResizeTextareas();
    }

    async getData() {
        const storage = await AspectStorage.getStorage();

        const aspects = storage ? (storage.getFlag("fatex-extras", AspectStorage.FLAGS.ASPECTS) || []) : [];
        const groups = storage ? (storage.getFlag("fatex-extras", AspectStorage.FLAGS.GROUPS) || []) : [];
        const globalTags = storage ? (storage.getFlag("fatex-extras", AspectStorage.FLAGS.TAGS) || []) : [];

        const filteredAspects = game.user.isGM ? aspects : aspects.filter(a => !a.hidden);
        const filteredGroups = game.user.isGM ? groups : groups.filter(g => !g.hidden);

        const groupedData = filteredGroups.map(g => {
            return {
                ...g,
                aspects: filteredAspects.filter(a => a.groupId === g.id).map(a => {
                    const aspectTags = (a.tagIds || []).map(tid => globalTags.find(t => t.id === tid)).filter(t => !!t);
                    return { ...a, displayTags: aspectTags, isGM: game.user.isGM };
                })
            };
        });

        const orphanAspects = filteredAspects.filter(a => !a.groupId || !groups.some(g => g.id === a.groupId)).map(a => {
            const aspectTags = (a.tagIds || []).map(tid => globalTags.find(t => t.id === tid)).filter(t => !!t);
            return { ...a, displayTags: aspectTags, isGM: game.user.isGM };
        });

        if (orphanAspects.length > 0) {
            groupedData.push({ id: "default", label: game.i18n.localize("FAx.Global.Uncategorized"), aspects: orphanAspects });
        }

        return {
            groups: groupedData,
            globalTags: globalTags,
            isGM: game.user.isGM,
            waitingForGM: !storage && !game.user.isGM
        };
    }

    activateListeners(html) {
        super.activateListeners(html);


        const $frame = html.closest(".window-app");
        if ($frame.length) html.find(".fatex-header").hide();

        $frame.find(".header-button.place-on-canvas").each((_, el) => {

            el.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
            el.setAttribute("draggable", "true");
            el.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                event.dataTransfer.setData("text/plain", JSON.stringify({ type: "PlaceAspectManager" }));
                event.dataTransfer.effectAllowed = "copy";
            }, true);
        });

        html.find(".aspect-color-trigger").each((_, el) => {
            el.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
            el.addEventListener("mousedown", (e) => e.stopPropagation());
            el.addEventListener("dragstart", (e) => { e.preventDefault(); e.stopPropagation(); return false; }, true);
        });
        html.find(".fatex-scene-aspect").each((_, el) => {
            el.addEventListener("dragstart", (e) => {
                if (e.target.classList.contains("aspect-color-trigger") || e.target.closest?.(".aspect-color-trigger")) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                if (e.target.closest?.(".aspect-name, .aspect-tag-pill, .add-tag-to-aspect, .invoke-control, .aspect-item-actions, input, button")) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, true);
        });

        html.find(".fatex-scene-aspect").each((_, el) => {
            el.setAttribute("draggable", "true");
        });
        html.find(".fatex-scene-aspects .create-group").on("click", (e) => this._onCreateGroup(e));
        html.find(".group-label").on("change", (e) => this._onUpdateGroupLabel(e));
        html.find(".group-delete").on("click", (e) => this._onDeleteGroup(e));
        html.find(".group-visibility").on("click", (e) => this._onToggleGroupVisibility(e));
        html.find(".group-collapse").on("click", (e) => this._onToggleGroupCollapse(e));
        html.find(".fatex-scene-aspects .manage-tags").on("click", (e) => this._onManageTags(e));

        html.find(".aspect-color-trigger").on("input", function() {
            const value = this.value;
            const $card = $(this).closest(".fatex-scene-aspect");
            if ($card.length) $card.css("border-left-color", value);
        }).on("change", (e) => this._onUpdateAspect(e));

        html.find(".aspect-color-trigger").on("focus", function() {
            const $card = $(this).closest(".fatex-scene-aspect");
            $card.attr("draggable", "false");
            if (!$card.find(".fatex-color-backdrop").length) {
                $card.append(`<div class="fatex-color-backdrop" style="position:absolute; inset:0; z-index:5; cursor:default; background:transparent;"></div>`);
                $card.find(".fatex-color-backdrop").on("click", function(e) {
                    e.stopPropagation();
                    $(this).remove();
                    $card.attr("draggable", "true");
                });
            }
        });
        html.find(".aspect-color-trigger").on("blur change", function() {
            const $card = $(this).closest(".fatex-scene-aspect");
            $card.attr("draggable", "true");
            $card.find(".fatex-color-backdrop").remove();
        });
        html.find(".create-aspect").on("click", (e) => this._onCreateAspect(e));
        html.find(".aspect-delete").on("click", (e) => this._onDeleteAspect(e));
        html.find(".aspect-name").on("change", (e) => this._onUpdateAspect(e));
        html.find(".aspect-tag-remove").on("click", (e) => this._onRemoveTagFromAspect(e));
        html.find(".add-tag-to-aspect").on("click", (e) => this._onShowTagPicker(e));
        html.find(".aspect-visibility").on("click", (e) => this._onToggleVisibility(e));
        html.find("textarea.aspect-name").each(function() {
            this.style.height = "auto";
            this.style.height = (this.scrollHeight) + "px";
        }).on("input", function() {
            this.style.height = "auto";
            this.style.height = (this.scrollHeight) + "px";
        });


        if (!this._autosizeBound) {
            this._autosizeBound = true;
            const rootEl = html.closest(".window-content")[0] || html[0];
            if (rootEl && window.ResizeObserver) {
                const flowNames = () => {
                    rootEl.querySelectorAll("textarea.aspect-name").forEach((ta) => {
                        ta.style.height = "auto";
                        ta.style.height = `${ta.scrollHeight}px`;
                    });
                };
                new ResizeObserver(flowNames).observe(rootEl);
            }
        }
        html.find(".invoke-control").on("click", (e) => this._onModifyInvokes(e));
        html.find(".fatex-search").on("input", (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this._applySearch(html);
        });
        html.find(".collapse-all").on("click", (e) => this._onToggleAllGroups(e, true));
        html.find(".expand-all").on("click", (e) => this._onToggleAllGroups(e, false));

        if (this.searchQuery) {
            html.find(".fatex-search").val(this.searchQuery);
            this._applySearch(html);
        }

        if (this.focusAspectId) {
            const target = html.find(`.fatex-scene-aspect[data-id="${this.focusAspectId}"]`);
            if (target.length) {
                target.closest(".fatex-group-content").removeClass("is-collapsed");
                target.closest(".fatex-group-header").find(".group-collapse").removeClass("fa-chevron-right").addClass("fa-chevron-down");
                target.addClass("fatex-focus");
                target[0].scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => target.removeClass("fatex-focus"), 2500);
            }
            this.focusAspectId = null;
        }
    }

    _applySearch(html) {
        const query = this.searchQuery;
        html.find(".fatex-scene-aspect").each(function() {
            const $el = $(this);
            const name = ($el.find(".aspect-name").val() || "").toLowerCase();
            const tags = $el.find(".aspect-tag-pill").map((_, p) => $(p).text()).get().join(" ").toLowerCase();
            $el.toggle(query === "" || name.includes(query) || tags.includes(query));
        });
        html.find(".fatex-aspect-group").each(function() {
            const $group = $(this);
            const visible = $group.find(".fatex-scene-aspect").is(":visible");
            $group.toggle(query === "" || visible);
        });
    }

    async _onToggleAllGroups(event, collapse) {
        if (!game.user.isGM) return;
        const groups = await this._getGroups();
        groups.forEach(g => { g.collapsed = !!collapse; });
        await this._saveGroups(groups);
    }

    async _onManageTags(event) {
        event.preventDefault();
        if (!game.user.isGM) return;
        const storage = await AspectStorage.getStorage();
        if (!storage) return;

        const tags = storage.getFlag("fatex-extras", AspectStorage.FLAGS.TAGS) || [];
        let tagHtml = `<div class="fatex-tag-manager">`;
        tags.forEach((tag) => {
            tagHtml += `<div class="fatex-tag-row" data-id="${tag.id}"><input type="text" class="tag-label" value="${tag.label}" placeholder="${game.i18n.localize("FAx.Global.TagName")}"><input type="color" class="tag-color" value="${tag.color || "#7a7a7a"}"><i class="fas fa-trash delete-tag"></i></div>`;
        });
        tagHtml += `<button type="button" class="add-tag-btn"><i class="fas fa-plus"></i> ${game.i18n.localize("FAx.Global.AddTag")}</button></div>`;

        new Dialog({
            title: game.i18n.localize("FAx.Global.ManageTags"),
            content: tagHtml,
            buttons: {
                save: {
                    label: game.i18n.localize("FAx.Global.Save"),
                    callback: async (html) => {
                        const newTags = [];
                        html.find(".fatex-tag-row").each(function() {
                            const existingId = $(this).attr("data-id");
                            newTags.push({
                                id: existingId && existingId !== "" ? existingId : foundry.utils.randomID(),
                                label: $(this).find(".tag-label").val(),
                                color: $(this).find(".tag-color").val()
                            });
                        });
                        const aspects = await this._getAspects();
                        const validTagIds = newTags.map(t => t.id);
                        aspects.forEach(a => { if (a.tagIds) a.tagIds = a.tagIds.filter(tid => validTagIds.includes(tid)); });
                        await this._saveAll(aspects, null, newTags);
                    }
                }
            },
            render: (html) => {
                html.find(".add-tag-btn").click(() => {
                    const newRow = $(`<div class="fatex-tag-row" data-id=""><input type="text" class="tag-label" value="${game.i18n.localize("FAx.Global.NewTag")}" placeholder="${game.i18n.localize("FAx.Global.TagName")}"><input type="color" class="tag-color" value="#7a7a7a"><i class="fas fa-trash delete-tag"></i></div>`);
                    newRow.find(".delete-tag").click(function() { $(this).closest(".fatex-tag-row").remove(); });
                    html.find(".fatex-tag-row").last().after(newRow);
                });
                html.find(".delete-tag").click(function() { $(this).closest(".fatex-tag-row").remove(); });
            }
        }).render(true);
    }

    async _onShowTagPicker(event) {
        if (!game.user.isGM) return;
        const aspectId = event.currentTarget.dataset.id;
        const storage = await AspectStorage.getStorage();
        if (!storage) return;

        const globalTags = storage.getFlag("fatex-extras", AspectStorage.FLAGS.TAGS) || [];
        const aspects = await this._getAspects();
        const aspect = aspects.find(a => a.id === aspectId);
        if (!aspect) return;

        const currentTagIds = aspect.tagIds || [];
        const availableTags = globalTags.filter(t => !currentTagIds.includes(t.id));

        let content = `<div class="fatex-tag-picker">`;
        if (availableTags.length > 0) {
            content += `<label><b>${game.i18n.localize("FAx.Global.PickExistingTag")}</b></label><div class="tag-list-scroll">`;
            availableTags.forEach(t => { content += `<button class="pick-tag" data-tag-id="${t.id}" style="border-left: 4px solid ${t.color}">${t.label}</button>`; });
            content += `</div><hr>`;
        }
        content += `<label><b>${game.i18n.localize("FAx.Global.CreateNewTag")}</b></label><div class="form-group"><input type="text" id="new-tag-name" placeholder="${game.i18n.localize("FAx.Global.TagName")}" style="margin-bottom: 5px;"><div style="display: flex; align-items: center; gap: 10px;"><label>${game.i18n.localize("FAx.Global.Color")}</label><input type="color" id="new-tag-color" value="#7a7a7a" style="height: 30px; cursor: pointer;"></div></div></div>`;

        const d = new Dialog({
            title: game.i18n.localize("FAx.Global.AddTag"),
            content: content,
            buttons: {
                create: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: game.i18n.localize("FAx.Global.CreateAndAdd"),
                    callback: async (html) => {
                        const name = html.find("#new-tag-name").val().trim();
                        const color = html.find("#new-tag-color").val();
                        if (!name) return;
                        const newTag = { id: foundry.utils.randomID(), label: name, color: color };
                        const updatedGlobalTags = [...globalTags, newTag];
                        const updatedAspects = await this._getAspects();
                        const targetAspect = updatedAspects.find(a => a.id === aspectId);
                        if (targetAspect) targetAspect.tagIds = [...(targetAspect.tagIds || []), newTag.id];
                        await this._saveAll(updatedAspects, null, updatedGlobalTags);
                    }
                }
            },
            default: "create",
            render: (html) => {
                html.find(".pick-tag").click(async (e) => {
                    const tid = e.currentTarget.dataset.tagId;
                    const updatedAspects = await this._getAspects();
                    const targetAspect = updatedAspects.find(a => a.id === aspectId);
                    if (targetAspect) targetAspect.tagIds = [...(targetAspect.tagIds || []), tid];
                    await this._saveAspects(updatedAspects);
                    d.close();
                });
            }
        }, { width: 400 });
        d.render(true);
    }

    async _onRemoveTagFromAspect(event) {
        if (!game.user.isGM) return;
        const aspects = await this._getAspects();
        const aspect = aspects.find(a => a.id === event.currentTarget.dataset.id);
        if (aspect && aspect.tagIds) {
            aspect.tagIds = aspect.tagIds.filter(tid => tid !== event.currentTarget.dataset.tagId);
            await this._saveAspects(aspects);
        }
    }

    async _onToggleGroupVisibility(event) {
        event.preventDefault();
        if (!game.user.isGM) return;
        const groups = await this._getGroups();
        const group = groups.find(g => g.id === event.currentTarget.dataset.groupId);
        if (group) { group.hidden = !group.hidden; await this._saveGroups(groups); }
    }

    async _onToggleGroupCollapse(event) {
        event.preventDefault();
        const groups = await this._getGroups();
        const group = groups.find(g => g.id === event.currentTarget.dataset.groupId);
        if (group) { group.collapsed = !group.collapsed; await this._saveGroups(groups); }
    }

    async _onToggleVisibility(event) {
        event.preventDefault();
        if (!game.user.isGM) return;
        const aspects = await this._getAspects();
        const aspect = aspects.find(a => a.id === event.currentTarget.dataset.id);
        if (aspect) { aspect.hidden = !aspect.hidden; await this._saveAspects(aspects); }
    }

    async _onCreateAspect(event) {
        if (!game.user.isGM) return;
        const groupId = event.currentTarget.dataset.groupId || "default";
        const aspects = await this._getAspects();
        aspects.push({ id: foundry.utils.randomID(), name: game.i18n.localize("FAx.Global.NewAspect"), color: "#4a4a4a", tagIds: [], invokes: 0, hostileInvokes: 0, groupId: groupId });
        await this._saveAspects(aspects);
    }

    async _onCreateGroup(event) {
        if (!game.user.isGM) return;
        const groups = await this._getGroups();
        groups.push({ id: foundry.utils.randomID(), label: game.i18n.localize("FAx.Global.NewCategory") });
        await this._saveGroups(groups);
    }

    async _onUpdateGroupLabel(event) {
        if (!game.user.isGM) return;
        const groups = await this._getGroups();
        const group = groups.find(g => g.id === event.currentTarget.dataset.groupId);
        if (group) { group.label = event.currentTarget.value; await this._saveGroups(groups); }
    }

    async _onDeleteGroup(event) {
        if (!game.user.isGM) return;
        const groupId = event.currentTarget.dataset.groupId;
        const confirm = await Dialog.confirm({ title: game.i18n.localize("FAx.Global.DeleteCategory"), content: game.i18n.localize("FAx.Global.DeleteCategoryConfirm"), defaultYes: false });
        if (!confirm) return;

        let groups = await this._getGroups();
        groups = groups.filter(g => g.id !== groupId);

        let aspects = await this._getAspects();
        aspects = aspects.filter(a => a.groupId !== groupId);

        await this._saveAll(aspects, groups);
    }

    async _onDeleteAspect(event) {
        if (!game.user.isGM) return;
        const confirm = await Dialog.confirm({ title: game.i18n.localize("FAx.Global.DeleteAspectTitle"), content: game.i18n.localize("FAx.Global.DeleteAspectConfirm"), defaultYes: false });
        if (!confirm) return;

        let aspects = await this._getAspects();
        aspects = aspects.filter(a => a.id !== event.currentTarget.dataset.id);
        await this._saveAspects(aspects);
    }

    async _onUpdateAspect(event) {
        if (!game.user.isGM) return;
        const input = event.currentTarget;
        const aspects = await this._getAspects();
        const aspect = aspects.find(a => a.id === input.dataset.id);
        if (aspect) { aspect[input.dataset.field || "name"] = input.value; await this._saveAspects(aspects); }
    }

    async _onModifyInvokes(event) {
        const btn = event.currentTarget;
        const aspects = await this._getAspects();
        const aspect = aspects.find(a => a.id === btn.dataset.id);
        if (aspect) {
            const field = btn.dataset.field || "invokes";
            if (btn.dataset.action === "increase") aspect[field] = (aspect[field] || 0) + 1;
            else aspect[field] = Math.max(0, (aspect[field] || 0) - 1);
            applyAspectInvokeValue(aspect.id, field, aspect[field]);
            game.socket.emit("module.fatex-extras", { action: "REFRESH_INVOKES", aspectId: aspect.id, field, value: aspect[field] });
            await this._saveAspects(aspects);
        }
    }

    async _updateObject(event, formData) {}

    async _getGroups() {
        const storage = await AspectStorage.getStorage();
        return storage ? foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.GROUPS) || []) : [];
    }

    async _getAspects() {
        const storage = await AspectStorage.getStorage();
        return storage ? foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.ASPECTS) || []) : [];
    }

    async _saveGroups(groups) { await this._saveAll(null, groups); }
    async _saveAspects(aspects) { await this._saveAll(aspects, null); }

    async _saveAll(aspects = null, groups = null, tags = null) {
        const storage = await AspectStorage.getStorage();
        if (!storage) {
            ui.notifications.warn(game.i18n.localize("FAx.Global.AspectStorageNotAvailable"));
            return;
        }

        if (aspects !== null) {
            await storage.setFlag("fatex-extras", "sceneAspects", aspects);

            if (game.user.isGM) {
                for (const aspect of aspects) {
                    await this._updateAspectDrawingsLocal(aspect);
                }
            }

            for (const aspect of aspects) {
                game.socket.emit("module.fatex-extras", {
                    action: "UPDATE_ASPECT_DRAWINGS",
                    aspectId: aspect.id
                });
            }
        }
        if (groups !== null) await storage.setFlag("fatex-extras", "sceneAspectGroups", groups);
        if (tags !== null) await storage.setFlag("fatex-extras", "sceneAspectTags", tags);

        game.socket.emit("module.fatex-extras", { action: "REFRESH_APPS" });
    }

    async _updateAspectDrawingsLocal(aspect) {
        const scene = game.scenes.active;
        if (!scene) return;

        const storage = await AspectStorage.getStorage();
        const allTags = storage?.getFlag("fatex-extras", "sceneAspectTags") || [];
        const aspectTags = (aspect.tagIds || []).map(tid => allTags.find(t => t.id === tid)).filter(Boolean);

        const showTags = game.settings.get("fatex-extras", "sceneDrawingShowTags") ?? true;
        const showInvokes = game.settings.get("fatex-extras", "sceneDrawingShowInvokes") ?? true;
        const showHostile = game.settings.get("fatex-extras", "sceneDrawingShowHostile") ?? true;
        const compactInvokes = game.settings.get("fatex-extras", "sceneDrawingCompactInvokes") ?? false;

        const tagsText = (showTags && aspectTags.length > 0) ? `[${aspectTags.map(t => t.label).join(' | ')}]` : '';

        let invokesLine = '';
        if (showInvokes || showHostile) {
            if (compactInvokes) {
                if (showInvokes && showHostile) {
                    invokesLine = `${"+".repeat(aspect.invokes || 0)} | ${"-".repeat(aspect.hostileInvokes || 0)}`;
                } else if (showInvokes) {
                    invokesLine = "+".repeat(aspect.invokes || 0);
                } else {
                    invokesLine = "-".repeat(aspect.hostileInvokes || 0);
                }
            } else {
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
        }

        const text = aspect.name + (tagsText ? '\n' + tagsText : '') + (invokesLine ? '\n' + invokesLine : '');
        const fillColor = aspect.color || "#4a4a4a";

        const drawings = scene.drawings.filter(d => d.getFlag("fatex-extras", "isAspectDrawing") && d.getFlag("fatex-extras", "aspectId") === aspect.id);

        for (const drawing of drawings) {
            const height = drawing.shape.height;
            const fontSize = Math.min(64, Math.max(10, Math.round(height * 0.18)));
            await drawing.update({ text: text, fillColor: fillColor, fontSize: fontSize });
        }
    }

    _onDragStart(event) {
        const li = event.currentTarget;
        if (li.classList.contains("aspect-tag-pill")) {
            this._dragType = "tag";
            event.dataTransfer.setData("text/plain", JSON.stringify({ type: "SceneAspectTag", aspectId: li.dataset.id, tagId: li.dataset.tagId }));
        } else if (li.classList.contains("fatex-group-header")) {
            this._dragType = "group";
            event.dataTransfer.setData("text/plain", JSON.stringify({ type: "SceneAspectGroup", id: li.dataset.groupId }));
        } else {
            this._dragType = "aspect";
            event.dataTransfer.setData("text/plain", JSON.stringify({ type: "SceneAspect", id: li.dataset.id }));
            if (!game.user.isGM) return;
        }
    }

    _onDragOver(event) {
        event.preventDefault();

        const clearIndicators = () => {
            this.element.find(".fatex-scene-aspect, .fatex-aspect-group, .aspect-tag-pill").removeClass("drag-left drag-right");
        };

        if (this._dragType === "tag") {
            clearIndicators();
            const tagPill = event.target.closest(".aspect-tag-pill");
            if (tagPill) {
                const rect = tagPill.getBoundingClientRect();
                if (event.clientX < rect.left + rect.width / 2) tagPill.classList.add("drag-left");
                else tagPill.classList.add("drag-right");
            }
        }
        else if (this._dragType === "group") {
            const group = event.target.closest(".fatex-aspect-group");

            if (!group) {
                clearIndicators();
                return;
            }

            const draggedId = JSON.parse(event.dataTransfer.getData("text/plain") || "{}").id;

            const rect = group.getBoundingClientRect();
            const isLeft = event.clientX < rect.left + rect.width / 2;
            const newClass = isLeft ? "drag-left" : "drag-right";

            if (group.classList.contains(newClass)) return;

            clearIndicators();

            group.classList.add(newClass);
        }
        else if (this._dragType === "aspect") {
            const aspect = event.target.closest(".fatex-scene-aspect");
            if (aspect) {
                const rect = aspect.getBoundingClientRect();
                const isLeft = event.clientX < rect.left + rect.width / 2;
                const newClass = isLeft ? "drag-left" : "drag-right";

                if (aspect.classList.contains(newClass)) return;

                clearIndicators();
                aspect.classList.add(newClass);
            } else {
                clearIndicators();
            }
        }
    }

    async _onDrop(event) {
        if (!game.user.isGM) return;
        this.element.find(".fatex-scene-aspect, .fatex-aspect-group, .aspect-tag-pill").removeClass("drag-top drag-bottom drag-left drag-right");
        let data;
        try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (err) { return; }

        if (data.type === "SceneAspectGroup") {
            const groups = await this._getGroups();
            const sourceIndex = groups.findIndex(g => g.id === data.id);
            const targetGroup = event.target.closest(".fatex-aspect-group");

            if (!targetGroup) {
                if (sourceIndex > -1) {
                    const [item] = groups.splice(sourceIndex, 1);
                    groups.push(item);
                    await this._saveGroups(groups);
                }
                return;
            }

            if (sourceIndex === -1) return;
            const targetIndex = groups.findIndex(g => g.id === targetGroup.dataset.groupId);
            const rect = targetGroup.getBoundingClientRect();
            let destinationIndex = targetIndex + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0);
            const [item] = groups.splice(sourceIndex, 1);
            if (sourceIndex < destinationIndex) destinationIndex--;
            groups.splice(destinationIndex, 0, item);
            await this._saveGroups(groups);
        } else if (data.type === "SceneAspectTag") {
            const aspects = await this._getAspects();
            const sourceAspect = aspects.find(a => a.id === data.aspectId);
            const targetList = event.target.closest(".aspect-tags-list");
            if (!sourceAspect || !targetList) return;
            const targetAspectId = targetList.querySelector(".add-tag-to-aspect").dataset.id;
            const targetAspect = aspects.find(a => a.id === targetAspectId);
            if (!targetAspect) return;
            if (data.aspectId !== targetAspectId && (targetAspect.tagIds || []).includes(data.tagId)) {
                ui.notifications.warn(game.i18n.localize("FAx.Global.AspectAlreadyHasTag")); return;
            }
            sourceAspect.tagIds = (sourceAspect.tagIds || []).filter(tid => tid !== data.tagId);
            const targetPill = event.target.closest(".aspect-tag-pill");
            if (targetPill) {
                const rect = targetPill.getBoundingClientRect();
                let targetIndex = (targetAspect.tagIds || []).indexOf(targetPill.dataset.tagId);
                if (event.clientX >= rect.left + rect.width / 2) targetIndex++;
                targetAspect.tagIds.splice(targetIndex, 0, data.tagId);
            } else { targetAspect.tagIds.push(data.tagId); }
            await this._saveAspects(aspects);
        } else if (data.type === "SceneAspect") {
            const aspects = await this._getAspects();
            const sourceAspect = aspects.find(a => a.id === data.id);
            if (!sourceAspect) return;
            const targetLink = event.target.closest(".fatex-scene-aspect");
            const targetGroup = event.target.closest(".fatex-aspect-group");
            if (targetLink) {
                const targetAspect = aspects.find(a => a.id === targetLink.dataset.id);
                const sourceIndex = aspects.indexOf(sourceAspect);
                const targetIndex = aspects.indexOf(targetAspect);
                const rect = targetLink.getBoundingClientRect();
                let destinationIndex = targetIndex + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0);
                sourceAspect.groupId = targetAspect.groupId;
                aspects.splice(sourceIndex, 1);
                if (sourceIndex < destinationIndex) destinationIndex--;
                aspects.splice(destinationIndex, 0, sourceAspect);
            } else if (targetGroup) {
                sourceAspect.groupId = targetGroup.dataset.groupId;
                aspects.splice(aspects.indexOf(sourceAspect), 1);
                aspects.push(sourceAspect);
            }
            await this._saveAspects(aspects);
        }
        this._dragType = null;
    }
}

export function applyAspectInvokeValue(aspectId, field, value) {
    if (!aspectId || !field) return;
    document.querySelectorAll(`.fatex-scene-aspect[data-id="${CSS.escape(aspectId)}"] .invoke-counter[data-field="${field}"] .invoke-value`).forEach(el => {
        el.textContent = String(value ?? 0);
    });
}
