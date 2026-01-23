export class AspectStorage {
    static FLAGS = {
        ASPECTS: "sceneAspects",
        GROUPS: "sceneAspectGroups",
        TAGS: "sceneAspectTags",
        IS_GLOBAL_STORAGE: "isGlobalAspectStorage",
        CHARACTER_INVOKES: "characterInvokes"
    };

    static async getStorage() {
        let journal = game.journal.find(j => j.getFlag("fatex-extras", AspectStorage.FLAGS.IS_GLOBAL_STORAGE));
        if (journal) return journal;
        if (game.user.isGM) return await AspectStorage._initializeGlobalStorage();
        return null;
    }

    static async _initializeGlobalStorage() {
        const defaultTags = [
            { id: "game", label: game.i18n.localize("FAx.Global.Game"), color: "#4a4a4a" },
            { id: "situation", label: game.i18n.localize("FAx.Global.Situation"), color: "#1a75ff" },
            { id: "boost", label: game.i18n.localize("FAx.Global.Boost"), color: "#ff9900" }
        ];

        const journalData = {
            name: game.i18n.localize("FAx.Global.GlobalAspectsJournalName"),
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }, 
            flags: {
                "fatex-extras": {
                    [AspectStorage.FLAGS.IS_GLOBAL_STORAGE]: true,
                    [AspectStorage.FLAGS.ASPECTS]: [],
                    [AspectStorage.FLAGS.GROUPS]: [],
                    [AspectStorage.FLAGS.TAGS]: defaultTags,
                    [AspectStorage.FLAGS.CHARACTER_INVOKES]: {}
                }
            }
        };

        return await JournalEntry.create(journalData);
    }

    static async syncItemToGlobal(item) {
        const storage = await AspectStorage.getStorage();
        if (!storage) return;

        const data = {
            value: item.getFlag("fatex-extras", "freeInvokes") || 0,
            name: item.name,
            text: item.system.value || "",
            type: item.type,
            actorId: item.parent?.id,
            actorName: item.parent?.name
        };

        await storage.setFlag("fatex-extras", `${AspectStorage.FLAGS.CHARACTER_INVOKES}.${item.id}`, data);
    }

    static async getGlobalInvokeCount(itemId) {
        const storage = await AspectStorage.getStorage();
        if (!storage) return 0;
        const data = storage.getFlag("fatex-extras", `${AspectStorage.FLAGS.CHARACTER_INVOKES}.${itemId}`);
        return data?.value || 0;
    }

    static async updateGlobalInvokeCount(itemId, newValue) {
        const storage = await AspectStorage.getStorage();
        if (!storage) return;
        
        await storage.setFlag("fatex-extras", `${AspectStorage.FLAGS.CHARACTER_INVOKES}.${itemId}.value`, newValue);
    }
}
