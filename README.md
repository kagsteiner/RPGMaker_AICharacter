# RPGMaker_AICharacter
A plugin for RPGMaker MZ for characters controlled by LLMs

## Purpose
NPCs for the RPGs you define wiht RPGMaker are clumsy to write and hard to write in a way that feels like an actual "non player character" (this holds true for most RPGs, actually).

This plugin allows you to connect an LLM from Mistral, from Deepseek, from Anthropic, from OpenAI or from a local LMStudio LLM to an RPGMaker event, turning it into a character you can talk to, and to have much more lively interactions with. It's a bit experimental. It works, is fairly bug-free, but I have no clue if it is realiable enough for a real productiv RPG.

Try it out and decide for yourself.

## Cost Warning
Please note that if you ship a game with my plugin, *remove the API key from the plugin settings and tell the user they need to get their own*, or they will play at your LLM costs.

## Features
Use the plugin in an RPGMaker MZ event to

- have an NPC react to chats, or starts discussions with the player (or other NPCs :) ) on their own.
- three options for the player to chat: enter a chat message via menu, with a "chat" button or as a reply to a chat from the NPC.
- Every NPC can have their own personality and background story that will affect their behavior.
- Let an NPC roam on its own, minding its own business and interacting with the player and environment as it wishes.
- Let an NPC pursue a goal, and react on whether it (believes it) has reached the goal, decided it failed, or wants to continue.
- Let an NPC trade items with the player (or other NPCs). NPCs can get items with a command, they can give them to the player, the player can give items to them.
- Give an NPC money or take it from him, or let the LLM decide whether to give money to the player based on the prompt.
- NPCs that want to go to a certain coordinate automatically do this by finding the shortest path there.
- Decide what LLM you want to use, how dialogs should look like and how they should be positioned.
- The commands tell the LLM the location of Player and all Events including its own.
- The commands tell the LLM the complete interaction history, which the game author can enrich.
- Supports the languages the LLM supports.

## Commands
ChatMenu has no command, it will create a "Chat" menu or a "Chat" button.

Commands of AICharacter:

### Set NPC Description
- description: any text. Use it to tell the LLM name and features of this NPC, background story etc. Ensure that you use the same article for description and other commands (ie. always "you" or "she").

### Set NPC Item Quantity
The plugin features a very simple item system so that the LLM can give the player items. Currently they cannot equip items, use them to fight or so. They are just for trading. Install the plugin GiveItemToNPC, and the player gets a "Give..." option in the RPG's item menu. He can then select an adjacent NPC and the item will be transferred from the character's inventory to the NPC's inventory. Please note: The NPC inventory is _outside_ of RPGMaker, just in the plugin. When the LLM is invoked to decide what to do, its inventory is passed as part of its context. If an NPC decides to give the player an item, the NPC's inventory will be adjusted accordingly (either the quantity owned by the NPC is reduced or the item is completely removed).

The command "Set NPC Item Quantity" can be used to programmatically set up the NPC's inventory. 
- id: the item's id - look it up in RPGMaker.
- quantity: the quantity. Set it to 3 and the NPC will own 3 of this kind.

### Set NPC Coins
The plugin stores how many coins the NPC has (initial 0). This commands sets it to any value.
- amount: number of coins.

Please note: the plugin ignores what currency you use in the game, it just works with coins. If you want your currency to be explicitly supported, you have to use a prompt like
"In this game, coins have the currency Schlumpfmark". Ensure to mention the currency when talking about money.

### Give Player Coins
Takes away a number of coins (default: all) from the NPC and gives them to the player.

### Decide And Act
Based on what is written in the description, allow the NPC to choose any action. Possible actions the NPC can select are:
- Move (coordinate) tries to move to reach the coordinate. The plugin will take the first step on the shortest path to this coordinate.
- Speak speaks the text the LLM wants to speak.
- Give: gives an item to the Player. To do this properly, the description should mention the item exactly as called in RPGMaker's item list, including the id/index.
- giveCoins: gives an amount of coints to the Player.
- Set Switch: changes the switch of an item. Typically used with "Decide Toward Goal".
- Wait: If the LLM doesn't know what to do, it can always wait between 500 ms and a second.
If the player performs a chat or give action towards this NPC while this command is running, it will be interrupted, no dialog or action is produced, the result variable remains unchanged. The user cannot detect this interruption, but in the normal loop this isn't required.

### Decide Toward Goal
You specify a goal and the LLM tries to reach it.
- Goal: describe PRECISLEY what goal to reach. Also describe how the LLM can judge whether it has reached the goal and whether it has surely failed reaching the goal. This is a key prompt. Small changes can make a large difference in LLM behavior.
- Result variable: when the LLM has finished this command, it will fill this variable with one of these values: 1 (LLM believes it has reached the goal), -1 (LLM believes it will be unable to reach the goal anymore), 0 (LLM wants to continue pursuing this goal). NOTE there is currently a bug that if the variable is 1 or -1 before calling the command, the command will not work. Either use different variables or initialize the variable to 0 before calling the command.
- Switch Policy: describe which game switches the LLM should have available to manipulate, what they do, mwybe why it wants to use them to reach the goal.
- Allowed Switch Ids: Comma-separated list of switches the LLM can switch. Note that I have never tried this out, but it might have potential.
If the player performs a chat or give action towards this NPC while this command is running, it will be interrupted, no dialog or action is produced, the result variable remains unchanged. The user cannot detect this interruption, but in the normal loop this isn't required.

### Add To History
A text that you pass as parameter will be added to the history that the LLM uses to decide the NPC's action. Use $NPC to mention the name of your NPC; the command will replace it by the name of the current event.
I needed this in a situation where an NPC has thrown the Player out of the dungeon due to misbehavior. The next time the Player came back he would immediately be thrown out again. Adding a line like "$NPC has thrown the player out of the dungeon. Once he reappears, $NPC will benevolently reconsider letting him stay". Maybe you have a similar situation.

## Usage
Put the two plugins AICharacter and ChatMenu into the js/plugins folder of your game. Then go to the plugin manager to define the following plugin parameters:

### AICharacter
- LLM API Key: Go to Mistral.ai, anthropic.com or OpenAI.com and get an API Key for your LLM. This will involve costs - playing with an LLM calls the LLM, which is not free.
- model: select a model. Every valid model name should work. Good entries:
   - mistral: mistral-large-latest - fast and quite expensive
   - openai: gpt-5-mini (my recommendation, although slow), gpt-5-nano, gpt-5 (if you are rich and patient),
   - anthropic: claude-haiku-4-5-20251001 (fast, great, expensive)
   - deepseek: deepseek-chat (fast, quite good, my second recommendation)
   - local: openai/gpt-oss-20b (not up to more complex tasks), 
- Provider: either mistral or openai or anthropic or lmstudio
- Mistral API Base URL, Anthropic API Base URL, Deepseek Base URL, OpenAI API Base URL: don't change (if you want to connect to a different LLM with the same API, like DeepSeek, changing this should work).
- LM Studio API Base URL: if you use a non-standard LMStudio setup, adjust the URL accordingly.
- Proxy URL: honestly, I don't know why ChatGPT found this important to generate. Leave empty.
- Temperature: 0.20 - the lower the more predictable - Mistral only, the new GPT5 models don't support temperatures
- Max Tokens: how many tokens max the LLM should generate. Also Mistral only.
- Language: the language that the LLM should communicate with. Should be in English like the prompts.
- Enable reply choice: when the NPC talks to you, do you immediately want a Reply / Continue option?
- Reply Choice label: The text of the button to reply.
- NPC Message background: inherit, window, dim, transparant - like the setting for normal dialogs.
- NPC Message position: inherit, top, middle, bottom - like the setting for normal dialogs.

What to do - Mistral:
1. get yourself a Mistral API Key from mistral.ai. Note: by default you get a free tier which will only allow 1 request per second. If your level has 1 NPC it has to wait 60 frames after each command invocation!
2. enter this key as LLM API Key
3. select mistral as provider
4. select mistral-large-latest as model
5. Be happy. Pay money.

Or do the same with OpenAI - openai as provider, gpt-5 / gpt-5-mini / gpt-5-nano as model, LLM API Key from OpenAI, and the same with Anthropic and DeepSeek.

Or try to go local:
1. Install lmstudio from https://lmstudio.ai/
2. Go to the "models" tab and download a few good models. I recommend openai/gpt-oss-20b
3. Go to the "developer" tab and start the server. Maybe preload the model.
4. select lmstudio as provider
5. select openai/gpt-oss-20b as the model
6. Be not that happy. Don't pay money.

### ChatMenu
A separate Plugin for a single purpose: actively initiate a chat with an NPC. You have a fine-grained control over which events you want to be enabled or disabled as "chat target". The plugin uses note tags for this. Enter the right note tag in the "Notes" (German: Hinweis) textfield next to the name of the event.
The Plugin has several parameters that influence its behavior:
- Enable Quick Chat Bar: enable and you get a chat bar (center bottom position) with a "chat" button so you can easily always start a chat.
- Quick bar label: the text of the button to chat.
- Include Tag: Name of the note tag that you have to use to mark an event as chat target. Default is ChatTarget, ie. use the note tag \<ChatTarget\>
- Exclude Tag: Name of the note tag that you have to use to mark an event as no chat target. Default is NoChat, ie. use the note tag \<NoChat\>
- Untagged included by default: whether an event that has not been marked by any tag should be a chat target.
- Restrict chat to nearby: select this if you only want to be able to chat to NPCs that are next to you.
 
### GiveItemToNPC
A separate Plugin for a single purpose: Enhance the Item menu with a give... option to give an item to an NPC.
Has no parameter.

## Example Event
My most successful experiments go like this:
1. create a new event, select parallel as trigger.
3. First event command is "Set NPC Description". Write a really nice description. The livelier the description, with background of the character in the story, description of how (s)he looks etc, the more the LLM has to chat about and act natural.
4. Add a loop.
5. Within the loop, do this:
   1. call "Decide Toward Goal". Select an unused variable to store the result of the command. Write a really crisp description of the goal to reach, and success/failure criteria the LLM will understand.
   2. create an if-then-else statement that does things depending on the outcome - using the variable you decided for in step 1. I typically create a second tab with condition "switch x is set", and set the switch when "Decide Toward Goal" returns 1 or -1. Also break the loop in these cases. Then go back to the first line of the event, and set the variable you use to 0 there. (sorry, ugly bug that won't go away, see below)
   3. Add a short wait statement, e.g. 500 msec to 2 sec. Without this wait, the parallel event will eat all time and the UI will hang.
6. At any time if the event performs RPGMaker actions that the LLMs should know about, use the "Add to history" command to make them known.

## Variable Initialization issue in Decide Toward Goal
Depending on how you use the "parallel" mode of your NPC event, the variable of "Decide Toward Goal" that holds the goal progress may be wrongly initialized. This can easily be solved by a first command to set this variable to 0. ALso I recommend to use different variables for different NPCs.

## Other known issues
- If a variable is non-zero when calling "Decide Towards Goal" the command can fail.
- Sometimes the LLM is annoyingly chatty, and you get a new dialog every few seconds. Sometimes the LLM is not chatty at all. Prompts are tricky.
- Player actions that are not chatting with the LLM are not added to the knowledge of the LLM yet.

## Version history
V1.0-1.2: basic plugin
V1.3: fixes and improvements when changing levels
  
  



