/*:
 * @target MZ
 * @plugindesc v1.1 Adds a "Chat" menu, an NPC picker, and an optional quick chat bar on the map.
 * @author You
 * 
 * @param EnableQuickBar
 * @text Enable Quick Chat Bar
 * @type boolean
 * @desc Show a small chat bar on the bottom of the map for quick player messages.
 * @default true
 * 
 * @param QuickBarLabel
 * @text Quick Bar Label
 * @type string
 * @default Chat…
 * 
 * @help ChatMenu.js
 * Adds a new "Chat" command to the main menu and a simple Chat scene to pick
 * an adjacent NPC and send a message. Optionally shows a compact quick chat bar
 * on the map so the player can quickly type a message.
 * 
 * Usage:
 * - Enable the plugin.
 * - Configure the Quick Chat Bar via plugin parameters.
 * - During NPC dialog (from AICharacter), a quick "Antworten…" choice may be offered.
 * 
 * Terms of Use: MIT
 */

(() => {
    "use strict";

    const pluginName = "ChatMenu";
    const params = PluginManager.parameters(pluginName);
    const enableQuickBar = String(params["EnableQuickBar"] || "true").toLowerCase() === "true";
    const quickBarLabel = String(params["QuickBarLabel"] || "Chat…");

    // 1) Inject "Chat" into the main menu command list
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        const enabled = this.areMainCommandsEnabled ? this.areMainCommandsEnabled() : true;
        this.addCommand("Chat", "chat", enabled);
    };

    // 2) Handle the new command in Scene_Menu
    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("chat", this.commandChat.bind(this));
    };

    Scene_Menu.prototype.commandChat = function () {
        SceneManager.push(Scene_Chat);
    };

    // 3) Chat scene: list adjacent NPCs, prompt for message, append to AI history
    function Scene_Chat() {
        this.initialize(...arguments);
    }

    Scene_Chat.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Chat.prototype.constructor = Scene_Chat;

    Scene_Chat.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_Chat.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this._helpWindow.setText("Chat\nChoose an adjacent NPC to chat with.");
        this._adjacent = this.findAdjacentNpcs();
        this.createNpcListWindow();
    };

    Scene_Chat.prototype.helpAreaHeight = function () {
        return this.calcWindowHeight(2, true);
    };

    Scene_Chat.prototype.createNpcListWindow = function () {
        const rect = this.npcListWindowRect();
        this._npcWindow = new Window_ChatNpcList(rect, this._adjacent);
        this._npcWindow.setHandler("ok", this.onNpcOk.bind(this));
        this._npcWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._npcWindow);
        this._npcWindow.activate();
        this._npcWindow.select(0);
    };

    Scene_Chat.prototype.npcListWindowRect = function () {
        const ww = 480;
        const wh = this.calcWindowHeight(6, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Math.floor((Graphics.boxHeight - wh) / 2);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Chat.prototype.findAdjacentNpcs = function () {
        const player = $gamePlayer;
        const px = player.x;
        const py = player.y;
        // Adjacent = Manhattan distance 1
        const events = $gameMap.events();
        const adj = events.filter(e => {
            const dx = Math.abs(e.x - px);
            const dy = Math.abs(e.y - py);
            const isSelf = false; // Player is not an event; no need to filter self
            return !isSelf && dx + dy === 1;
        }).map(e => ({ id: e.eventId(), name: e.event().name || ("Event " + e.eventId()), x: e.x, y: e.y }));
        return adj;
    };

    Scene_Chat.prototype.onNpcOk = function () {
        const npc = this._npcWindow.currentNpc();
        if (!npc) {
            this.popScene();
            return;
        }
        // Use default text input dialog provided by Window_NameEdit/Window_NameInput pattern
        this.openTextInputForNpc(npc);
    };

    // 4) Quick Chat Bar on Scene_Map (optional)
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        if (enableQuickBar) {
            this.createChatQuickBar();
        }
    };

    Scene_Map.prototype.createChatQuickBar = function () {
        const rect = this.chatQuickBarRect();
        this._chatQuickBar = new Window_ChatQuickBar(rect, quickBarLabel);
        this._chatQuickBar.setHandler("ok", this.onQuickBarOk.bind(this));
        this._chatQuickBar.setHandler("cancel", () => { });
        this.addWindow(this._chatQuickBar);
        this._chatQuickBar.deactivate();
    };

    Scene_Map.prototype.chatQuickBarRect = function () {
        const ww = Math.max(240, Math.floor(Graphics.boxWidth * 0.3));
        const wh = this.calcWindowHeight(2, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Graphics.boxHeight - wh - 12;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Map.prototype.onQuickBarOk = function () {
        // If exactly one adjacent NPC, prompt directly; else push NPC picker.
        const adj = ChatMenu_findAdjacentNpcs();
        if (adj.length === 1) {
            ChatMenu_promptToNpc(adj[0]);
        } else if (adj.length > 1) {
            SceneManager.push(Scene_Chat);
        } else {
            $gameMessage.add("No adjacent NPCs");
        }
        if (this._chatQuickBar) this._chatQuickBar.deactivate();
    };

    function ChatMenu_findAdjacentNpcs() {
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

    function ChatMenu_promptToNpc(npc) {
        try {
            if (typeof window !== "undefined" && window.AICharacter && typeof window.AICharacter.promptPlayerMessageToNpc === "function") {
                window.AICharacter.promptPlayerMessageToNpc(npc);
                return;
            }
        } catch (_) { }
        try {
            if (typeof window !== "undefined" && window.prompt) {
                const t = window.prompt("Message to " + (npc.name || ("Event " + npc.id)) + ":", "");
                if (t && t.trim().length > 0) {
                    if (window.AICharacter && typeof window.AICharacter.addToGlobalHistory === "function") {
                        window.AICharacter.addToGlobalHistory("Player says to " + (npc.name || ("Event " + npc.id)) + ": \"" + t.trim() + "\"");
                    }
                }
            }
        } catch (_) { }
    }

    function Window_ChatQuickBar() { this.initialize(...arguments); }
    Window_ChatQuickBar.prototype = Object.create(Window_Selectable.prototype);
    Window_ChatQuickBar.prototype.constructor = Window_ChatQuickBar;
    Window_ChatQuickBar.prototype.initialize = function (rect, label) {
        this._label = String(label || "Chat…");
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_ChatQuickBar.prototype.maxItems = function () { return 1; };
    Window_ChatQuickBar.prototype.itemHeight = function () { return this.lineHeight(); };
    Window_ChatQuickBar.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(this._label, rect.x, rect.y, rect.width, "center");
        this.resetTextColor();
    };
    Window_ChatQuickBar.prototype.isOkEnabled = function () { return true; };
    Window_ChatQuickBar.prototype.update = function () {
        Window_Selectable.prototype.update.call(this);
        // Activate only when player can input (no message/progress)
        if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) {
            this.deactivate();
        } else {
            this.activate();
        }
    };

    Scene_Chat.prototype.openTextInputForNpc = function (npc) {
        // Simple approach: use prompt() in NW.js runtime; fallback to message if unavailable
        let text = null;
        try {
            if (typeof window !== "undefined" && window.prompt) {
                text = window.prompt("Message to " + (npc.name || ("Event " + npc.id)) + ":", "");
            }
        } catch (_) {
            text = null;
        }
        if (text && text.trim().length > 0) {
            const line = "Player says to " + (npc.name || ("Event " + npc.id)) + ": \"" + text.trim() + "\"";
            if (window.AICharacter && typeof window.AICharacter.addToGlobalHistory === "function") {
                window.AICharacter.addToGlobalHistory(line);
            }
            // Optionally show it in-game immediately
            //$gameMessage.setSpeakerName("You");
            //$gameMessage.add(text.trim());
        }
        this.popScene();
    };

    function Window_ChatNpcList() {
        this.initialize(...arguments);
    }

    Window_ChatNpcList.prototype = Object.create(Window_Selectable.prototype);
    Window_ChatNpcList.prototype.constructor = Window_ChatNpcList;

    Window_ChatNpcList.prototype.initialize = function (rect, npcs) {
        this._npcs = Array.isArray(npcs) ? npcs : [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_ChatNpcList.prototype.maxItems = function () {
        return Math.max(1, this._npcs.length);
    };

    Window_ChatNpcList.prototype.itemHeight = function () {
        return this.lineHeight();
    };

    Window_ChatNpcList.prototype.drawItem = function (index) {
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

    Window_ChatNpcList.prototype.currentNpc = function () {
        if (this._npcs.length === 0) return null;
        return this._npcs[this.index()];
    };

    Window_ChatNpcList.prototype.isOkEnabled = function () {
        return this._npcs.length > 0;
    };
})();


