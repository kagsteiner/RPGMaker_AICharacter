/*:
 * @target MZ
 * @plugindesc v1.0 Add "Give to NPC" flow in Item menu: pick adjacent NPC, decrement item, log histories.
 * @author You
 * 
 * @help GiveItemToNpc.js
 * Adds a new command in the Item scene to give the selected item to an adjacent NPC.
 * Flow:
 * - In the Item list, confirm an item → choose "Use" (default) or "Give…" (new).
 * - "Give…" opens a small NPC picker listing adjacent events.
 * - Choosing an NPC reduces the item by 1, writes a message, appends to global history,
 *   and appends to that NPC's memory via AICharacter.addToNpcMemory (if available).
 * 
 * Requirements:
 * - Works best with AICharacter.js present to store histories, but will not crash if absent.
 * - Uses adjacent (Manhattan distance = 1) events as potential NPCs.
 * 
 * Terms: MIT
 */

(() => {
    "use strict";

    // Extend Scene_Item to insert a Use / Give… selector using a command window
    const _Scene_Item_onItemOk = Scene_Item.prototype.onItemOk;
    Scene_Item.prototype.onItemOk = function () {
        this.openGiveActionWindow();
    };

    Scene_Item.prototype.openGiveActionWindow = function () {
        if (this._itemWindow && this._itemWindow.deactivate) this._itemWindow.deactivate();
        const rect = this.giveActionWindowRect();
        this._giveActionWindow = new Window_GiveAction(rect);
        this._giveActionWindow.setHandler("use", () => {
            this.closeGiveActionWindow();
            _Scene_Item_onItemOk.call(this);
        });
        this._giveActionWindow.setHandler("give", () => {
            this.closeGiveActionWindow();
            this.commandGiveItemToNpc();
        });
        this._giveActionWindow.setHandler("cancel", () => {
            this.closeGiveActionWindow();
            this.onItemCancel();
        });
        this.addWindow(this._giveActionWindow);
        this._giveActionWindow.activate();
        this._giveActionWindow.select(0);
    };

    Scene_Item.prototype.closeGiveActionWindow = function () {
        if (this._giveActionWindow) {
            const w = this._giveActionWindow;
            try { if (w.deactivate) w.deactivate(); } catch (_) { }
            try { if (w.close) w.close(); } catch (_) { }
            try { if (w.hide) w.hide(); } catch (_) { }
            try { if (w.parent && w.parent.removeChild) w.parent.removeChild(w); } catch (_) { }
            this._giveActionWindow = null;
        }
    };

    Scene_Item.prototype.giveActionWindowRect = function () {
        const ww = 260;
        const wh = this.calcWindowHeight(3, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Math.floor((Graphics.boxHeight - wh) / 2);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Item.prototype.commandGiveItemToNpc = function () {
        const item = this.item();
        if (!item) {
            this.onItemCancel();
            return;
        }
        // If no adjacent NPCs, inform and return
        const adj = findAdjacentNpcs();
        if (adj.length <= 0) {
            $gameMessage.add("No adjacent NPCs");
            this.onItemCancel();
            return;
        }
        this.openNpcPickerForGive(item, adj);
    };

    Scene_Item.prototype.openNpcPickerForGive = function (item, adjacentNpcs) {
        this._giveContext = { item, adjacentNpcs };
        const rect = this.giveNpcListWindowRect();
        this._giveNpcWindow = new Window_GiveNpcList(rect, adjacentNpcs);
        this._giveNpcWindow.setHandler("ok", this.onGiveNpcOk.bind(this));
        this._giveNpcWindow.setHandler("cancel", this.onGiveNpcCancel.bind(this));
        this.addWindow(this._giveNpcWindow);
        this._giveNpcWindow.activate();
        this._giveNpcWindow.select(0);
    };

    Scene_Item.prototype.giveNpcListWindowRect = function () {
        const ww = 520;
        const wh = this.calcWindowHeight(6, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Math.floor((Graphics.boxHeight - wh) / 2);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Item.prototype.onGiveNpcCancel = function () {
        if (this._giveNpcWindow) {
            const w = this._giveNpcWindow;
            try { if (w.deactivate) w.deactivate(); } catch (_) { }
            try { if (w.close) w.close(); } catch (_) { }
            try { if (w.hide) w.hide(); } catch (_) { }
            try { if (w.parent && w.parent.removeChild) w.parent.removeChild(w); } catch (_) { }
            this._giveNpcWindow = null;
        }
        // Return focus to item list
        if (this._itemWindow) {
            this._itemWindow.activate();
        }
    };

    Scene_Item.prototype.onGiveNpcOk = function () {
        const win = this._giveNpcWindow;
        if (!win) return this.onGiveNpcCancel();
        const npc = win.currentNpc();
        const item = this._giveContext && this._giveContext.item;
        if (!npc || !item) return this.onGiveNpcCancel();

        // Perform the give: decrement item, show message, append histories
        const itemName = item.name || "item";
        const npcName = npc.name || ("Event " + npc.id);

        // Check possession
        if (!$gameParty || !$gameParty.numItems || $gameParty.numItems(item) <= 0) {
            $gameMessage.add("You don't have any " + itemName + ".");
            return this.onGiveNpcCancel();
        }

        // Reduce the item by 1
        $gameParty.loseItem(item, 1, false);

        // Refresh item list so counts and presence update immediately
        try {
            if (this._itemWindow && this._itemWindow.refresh) {
                const prevIndex = this._itemWindow.index ? this._itemWindow.index() : 0;
                this._itemWindow.refresh();
                const max = this._itemWindow.maxItems ? this._itemWindow.maxItems() : 0;
                if (max > 0 && this._itemWindow.select) {
                    this._itemWindow.select(Math.min(Math.max(prevIndex, 0), Math.max(0, max - 1)));
                }
                if (this._itemWindow.updateHelp) this._itemWindow.updateHelp();
            }
        } catch (_) { }

        // Optional: show a confirmation message only on map scenes to avoid interfering with menu flow
        try {
            if (SceneManager._scene && SceneManager._scene instanceof Scene_Map) {
                $gameMessage.add("You give " + itemName + " to " + npcName + ".");
            }
        } catch (_) { }

        // Append to global history, if available
        try {
            if (window.AICharacter && typeof window.AICharacter.addToGlobalHistory === "function") {
                window.AICharacter.addToGlobalHistory("Player gives " + itemName + " to " + npcName);
            }
        } catch (_) { }

        // Add to NPC inventory via AICharacter if available
        try {
            if (window.AICharacter && typeof window.AICharacter.adjustNpcInventory === "function") {
                window.AICharacter.adjustNpcInventory({ mapId: $gameMap.mapId(), eventId: npc.id }, item.id || itemIdFromData(item), itemName, +1);
            }
        } catch (_) { }

        // Append to NPC memory, if available
        try {
            if (window.AICharacter && typeof window.AICharacter.addToNpcMemory === "function") {
                window.AICharacter.addToNpcMemory({ mapId: $gameMap.mapId(), eventId: npc.id }, "Received " + itemName + " from Player");
            }
        } catch (_) { }

        // Invalidate NPC's ongoing thinking so it considers the new state immediately
        try {
            if (window.AICharacter && typeof window.AICharacter.invalidateNpcThinking === "function") {
                window.AICharacter.invalidateNpcThinking({ mapId: $gameMap.mapId(), eventId: npc.id });
            }
        } catch (_) { }

        // Close picker and return
        this.onGiveNpcCancel();
    };

    function findAdjacentNpcs() {
        const player = $gamePlayer;
        const px = player.x;
        const py = player.y;
        const events = $gameMap.events();
        const adj = events.filter(e => {
            const dx = Math.abs(e.x - px);
            const dy = Math.abs(e.y - py);
            return dx + dy === 1;
        }).map(e => ({ id: e.eventId(), name: e.event().name || ("Event " + e.eventId()), x: e.x, y: e.y }));
        return adj;
    }

    function itemIdFromData(item) {
        // Attempt to resolve item database id by identity from $dataItems
        try {
            if ($dataItems) {
                for (let i = 1; i < $dataItems.length; i++) {
                    if ($dataItems[i] === item) return i;
                }
            }
        } catch (_) { }
        return 0;
    }

    function Window_GiveNpcList() { this.initialize(...arguments); }
    Window_GiveNpcList.prototype = Object.create(Window_Selectable.prototype);
    Window_GiveNpcList.prototype.constructor = Window_GiveNpcList;
    Window_GiveNpcList.prototype.initialize = function (rect, npcs) {
        this._npcs = Array.isArray(npcs) ? npcs : [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_GiveNpcList.prototype.maxItems = function () { return Math.max(1, this._npcs.length); };
    Window_GiveNpcList.prototype.itemHeight = function () { return this.lineHeight(); };
    Window_GiveNpcList.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        if (this._npcs.length === 0) {
            this.changeTextColor(ColorManager.textColor(8));
            this.drawText("No adjacent NPCs", rect.x, rect.y, rect.width, "left");
            this.resetTextColor();
            return;
        }
        const npc = this._npcs[index];
        const label = (npc.name || ("Event " + npc.id)) + "  (" + npc.x + "," + npc.y + ")";
        this.drawText(label, rect.x, rect.y, rect.width, "left");
    };
    Window_GiveNpcList.prototype.currentNpc = function () {
        if (this._npcs.length === 0) return null;
        return this._npcs[this.index()];
    };
    Window_GiveNpcList.prototype.isOkEnabled = function () { return this._npcs.length > 0; };

    function Window_GiveAction() { this.initialize(...arguments); }
    Window_GiveAction.prototype = Object.create(Window_Command.prototype);
    Window_GiveAction.prototype.constructor = Window_GiveAction;
    Window_GiveAction.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_GiveAction.prototype.makeCommandList = function () {
        this.addCommand("Use", "use");
        this.addCommand("Give…", "give");
        this.addCommand("Cancel", "cancel");
    };
})();


