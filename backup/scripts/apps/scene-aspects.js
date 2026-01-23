export class SceneAspectsApp extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "fatex-scene-aspects",
            title: "Aspect Manager",
            template: "modules/fatex-extras/templates/scene-aspects.hbs",
            width: 500,
            height: 600,
            classes: ["fatex", "fatex-extras-app"],
            resizable: true,
            closeOnSubmit: false,
            submitOnChange: false,
            dragDrop: [
                { dragSelector: ".fatex-scene-aspect, .aspect-tag-pill, .fatex-group-header", dropSelector: ".fatex-desk__aspects" }
            ]
        });
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

    getData() {
        const aspects = canvas.scene ? (canvas.scene.getFlag("fatex-extras", "sceneAspects") || []) : [];
        const groups = canvas.scene ? (canvas.scene.getFlag("fatex-extras", "sceneAspectGroups") || []) : [];
        const globalTags = canvas.scene ? (canvas.scene.getFlag("fatex-extras", "sceneAspectTags") || [
            { id: "game", label: "Game", color: "#4a4a4a" },
            { id: "situation", label: "Situation", color: "#1a75ff" },
            { id: "boost", label: "Boost", color: "#ff9900" }
        ]) : [];

        // Players see all groups and aspects (Full Control Mode)
        const filteredAspects = aspects;
        
        // We show all groups to everyone so they can create/manage them
        const groupedData = groups.map(g => {
            return {
                ...g,
                aspects: filteredAspects.filter(a => a.groupId === g.id).map(a => {
                    const aspectTags = (a.tagIds || []).map(tid => globalTags.find(t => t.id === tid)).filter(t => !!t);
                    return { ...a, displayTags: aspectTags };
                })
            };
        });
        
        const orphanAspects = filteredAspects.filter(a => !a.groupId || !groups.some(g => g.id === a.groupId)).map(a => {
            const aspectTags = (a.tagIds || []).map(tid => globalTags.find(t => t.id === tid)).filter(t => !!t);
            return { ...a, displayTags: aspectTags };
        });

        if (orphanAspects.length > 0) {
            groupedData.push({ id: "default", label: "Uncategorized", aspects: orphanAspects });
        }

        return { 
            groups: groupedData, 
            globalTags: globalTags, 
            isGM: game.user.isGM 
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".create-group").on("click", (e) => this._onCreateGroup(e));
        html.find(".group-label").on("change", (e) => this._onUpdateGroupLabel(e));
        html.find(".group-delete").on("click", (e) => this._onDeleteGroup(e));
        html.find(".manage-tags").on("click", (e) => this._onManageTags(e));
        html.find(".aspect-color-trigger").on("change", (e) => this._onUpdateAspect(e));
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
        html.find(".invoke-control").on("click", (e) => this._onModifyInvokes(e));
    }

    async _onManageTags(event) {
        event.preventDefault();
        const tags = canvas.scene.getFlag("fatex-extras", "sceneAspectTags") || [];
        let tagHtml = `<div class="fatex-tag-manager">`;
        tags.forEach((tag) => {
            tagHtml += `<div class="fatex-tag-row" data-id="${tag.id}"><input type="text" class="tag-label" value="${tag.label}" placeholder="Tag Name"><input type="color" class="tag-color" value="${tag.color || "#7a7a7a"}"><i class="fas fa-trash delete-tag"></i></div>`;
        });
        tagHtml += `<button type="button" class="add-tag-btn"><i class="fas fa-plus"></i> Add Tag Definition</button></div>`;

        new Dialog({
            title: "Manage Tag Definitions",
            content: tagHtml,
            buttons: {
                save: {
                    label: "Save Changes",
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
                        const aspects = this._getAspects();
                        const validTagIds = newTags.map(t => t.id);
                        aspects.forEach(a => { if (a.tagIds) a.tagIds = a.tagIds.filter(tid => validTagIds.includes(tid)); });
                        await this._saveAll(aspects, null, newTags);
                    }
                }
            },
            render: (html) => {
                html.find(".add-tag-btn").click(() => {
                    const newRow = $(`<div class="fatex-tag-row" data-id=""><input type="text" class="tag-label" value="New Tag" placeholder="Tag Name"><input type="color" class="tag-color" value="#7a7a7a"><i class="fas fa-trash delete-tag"></i></div>`);
                    newRow.find(".delete-tag").click(function() { $(this).closest(".fatex-tag-row").remove(); });
                    html.find(".fatex-tag-row").last().after(newRow);
                });
                html.find(".delete-tag").click(function() { $(this).closest(".fatex-tag-row").remove(); });
            }
        }).render(true);
    }

    async _onShowTagPicker(event) {
        const aspectId = event.currentTarget.dataset.id;
        const globalTags = canvas.scene.getFlag("fatex-extras", "sceneAspectTags") || [];
        const aspects = this._getAspects();
        const aspect = aspects.find(a => a.id === aspectId);
        if (!aspect) return;

        const currentTagIds = aspect.tagIds || [];
        const availableTags = globalTags.filter(t => !currentTagIds.includes(t.id));

        let content = `<div class="fatex-tag-picker">`;
        if (availableTags.length > 0) {
            content += `<label><b>Pick Existing Tag</b></label><div class="tag-list-scroll">`;
            availableTags.forEach(t => { content += `<button class="pick-tag" data-tag-id="${t.id}" style="border-left: 4px solid ${t.color}">${t.label}</button>`; });
            content += `</div><hr>`;
        }
        content += `<label><b>Create New Tag</b></label><div class="form-group"><input type="text" id="new-tag-name" placeholder="Tag Name" style="margin-bottom: 5px;"><div style="display: flex; align-items: center; gap: 10px;"><label>Color:</label><input type="color" id="new-tag-color" value="#7a7a7a" style="height: 30px; cursor: pointer;"></div></div></div>`;

        const d = new Dialog({
            title: "Add Tag",
            content: content,
            buttons: {
                create: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: "Create & Add",
                    callback: async (html) => {
                        const name = html.find("#new-tag-name").val().trim();
                        const color = html.find("#new-tag-color").val();
                        if (!name) return;
                        const newTag = { id: foundry.utils.randomID(), label: name, color: color };
                        const updatedGlobalTags = [...globalTags, newTag];
                        const updatedAspects = this._getAspects();
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
                    const updatedAspects = this._getAspects();
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
        const aspects = this._getAspects();
        const aspect = aspects.find(a => a.id === event.currentTarget.dataset.id);
        if (aspect && aspect.tagIds) {
            aspect.tagIds = aspect.tagIds.filter(tid => tid !== event.currentTarget.dataset.tagId);
            await this._saveAspects(aspects);
        }
    }

    async _onToggleVisibility(event) {
        event.preventDefault();
        const aspects = this._getAspects();
        const aspect = aspects.find(a => a.id === event.currentTarget.dataset.id);
        if (aspect) { aspect.hidden = !aspect.hidden; await this._saveAspects(aspects); }
    }

    async _onCreateAspect(event) {
        const groupId = event.currentTarget.dataset.groupId || "default";
        const aspects = this._getAspects();
        aspects.push({ id: foundry.utils.randomID(), name: "New Aspect", color: "#4a4a4a", tagIds: [], invokes: 0, hostileInvokes: 0, groupId: groupId });
        await this._saveAspects(aspects);
    }

    async _onCreateGroup(event) {
        const groups = this._getGroups();
        groups.push({ id: foundry.utils.randomID(), label: "New Category" });
        await this._saveGroups(groups);
    }

    async _onUpdateGroupLabel(event) {
        const groups = this._getGroups();
        const group = groups.find(g => g.id === event.currentTarget.dataset.groupId);
        if (group) { group.label = event.currentTarget.value; await this._saveGroups(groups); }
    }

    async _onDeleteGroup(event) {
        const groupId = event.currentTarget.dataset.groupId;
        const confirm = await Dialog.confirm({ title: "Delete Category", content: "Are you sure you want to delete this category and all its aspects?", defaultYes: false });
        if (!confirm) return;
        const groups = this._getGroups().filter(g => g.id !== groupId);
        const aspects = this._getAspects().filter(a => a.groupId !== groupId);
        await this._saveAll(aspects, groups);
    }

    async _onDeleteAspect(event) {
        const confirm = await Dialog.confirm({ title: game.i18n.localize("FAx.Global.DeleteAspectTitle"), content: game.i18n.localize("FAx.Global.DeleteAspectConfirm"), defaultYes: false });
        if (!confirm) return;
        const aspects = this._getAspects().filter(a => a.id !== event.currentTarget.dataset.id);
        await this._saveAspects(aspects);
    }

    async _onUpdateAspect(event) {
        const input = event.currentTarget;
        const aspects = this._getAspects();
        const aspect = aspects.find(a => a.id === input.dataset.id);
        if (aspect) { aspect[input.dataset.field || "name"] = input.value; await this._saveAspects(aspects); }
    }

    async _onModifyInvokes(event) {
        const btn = event.currentTarget;
        const aspects = this._getAspects();
        const aspect = aspects.find(a => a.id === btn.dataset.id);
        if (aspect) {
            const field = btn.dataset.field || "invokes";
            if (btn.dataset.action === "increase") aspect[field] = (aspect[field] || 0) + 1;
            else aspect[field] = Math.max(0, (aspect[field] || 0) - 1);
            await this._saveAspects(aspects);
        }
    }

    async _updateObject(event, formData) {}

    _getGroups() { return foundry.utils.duplicate(canvas.scene.getFlag("fatex-extras", "sceneAspectGroups") || []); }
    _getAspects() { return foundry.utils.duplicate(canvas.scene.getFlag("fatex-extras", "sceneAspects") || []); }

    async _saveGroups(groups) { await this._saveAll(null, groups); }
    async _saveAspects(aspects) { await this._saveAll(aspects, null); }

    async _saveAll(aspects = null, groups = null, tags = null) {
        if (!canvas.scene) return;
        const update = {};
        if (aspects !== null) update["flags.fatex-extras.sceneAspects"] = aspects;
        if (groups !== null) update["flags.fatex-extras.sceneAspectGroups"] = groups;
        if (tags !== null) update["flags.fatex-extras.sceneAspectTags"] = tags;

        // Try direct update first (Works for GM or players with Scene permission)
        if (canvas.scene.isOwner) {
            await canvas.scene.update(update);
            game.socket.emit("module.fatex-extras", { type: "forceRenderManager" });
            this.render();
        } else {
            // Forward everything to GM
            game.socket.emit("module.fatex-extras", { 
                type: "updateSceneAspects", 
                aspects: aspects, 
                groups: groups, 
                tags: tags 
            });
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
        }
    }

    _onDragOver(event) {
        this.element.find(".fatex-scene-aspect, .fatex-aspect-group, .aspect-tag-pill").removeClass("drag-top drag-bottom drag-left drag-right");
        if (this._dragType === "tag") {
            const tagPill = event.target.closest(".aspect-tag-pill");
            if (tagPill) {
                const rect = tagPill.getBoundingClientRect();
                if (event.clientX < rect.left + rect.width / 2) tagPill.classList.add("drag-left");
                else tagPill.classList.add("drag-right");
            }
        } else if (this._dragType === "group") {
            const group = event.target.closest(".fatex-aspect-group");
            if (group) {
                const rect = group.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height / 2) group.classList.add("drag-top");
                else group.classList.add("drag-bottom");
            }
        } else if (this._dragType === "aspect") {
            const aspect = event.target.closest(".fatex-scene-aspect");
            if (aspect) {
                const rect = aspect.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height / 2) aspect.classList.add("drag-top");
                else aspect.classList.add("drag-bottom");
            }
        }
    }

    async _onDrop(event) {
        this.element.find(".fatex-scene-aspect, .fatex-aspect-group, .aspect-tag-pill").removeClass("drag-top drag-bottom drag-left drag-right");
        let data;
        try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (err) { return; }

        if (data.type === "SceneAspectGroup") {
            const groups = this._getGroups();
            const sourceIndex = groups.findIndex(g => g.id === data.id);
            const targetGroup = event.target.closest(".fatex-aspect-group");
            if (!targetGroup || sourceIndex === -1) return;
            const targetIndex = groups.findIndex(g => g.id === targetGroup.dataset.groupId);
            const rect = targetGroup.getBoundingClientRect();
            let destinationIndex = targetIndex + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0);
            const [item] = groups.splice(sourceIndex, 1);
            if (sourceIndex < destinationIndex) destinationIndex--;
            groups.splice(destinationIndex, 0, item);
            await this._saveGroups(groups);
        } else if (data.type === "SceneAspectTag") {
            const aspects = this._getAspects();
            const sourceAspect = aspects.find(a => a.id === data.aspectId);
            const targetList = event.target.closest(".aspect-tags-list");
            if (!sourceAspect || !targetList) return;
            const targetAspectId = targetList.querySelector(".add-tag-to-aspect").dataset.id;
            const targetAspect = aspects.find(a => a.id === targetAspectId);
            if (!targetAspect) return;
            if (data.aspectId !== targetAspectId && (targetAspect.tagIds || []).includes(data.tagId)) {
                ui.notifications.warn("This aspect already has this tag."); return;
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
            const aspects = this._getAspects();
            const sourceAspect = aspects.find(a => a.id === data.id);
            if (!sourceAspect) return;
            const targetLink = event.target.closest(".fatex-scene-aspect");
            const targetGroup = event.target.closest(".fatex-aspect-group");
            if (targetLink) {
                const targetAspect = aspects.find(a => a.id === targetLink.dataset.id);
                const sourceIndex = aspects.indexOf(sourceAspect);
                const targetIndex = aspects.indexOf(targetAspect);
                const rect = targetLink.getBoundingClientRect();
                let destinationIndex = targetIndex + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0);
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
