# The LLM Analyzer Tool

This tool reads log files you create while playtesting your game with LLM NPC characters, and then helps you select the right LLM, and fine-tune the texts that define your NPC behavior. 

## Features

* *performance statistics*: find out what the average / max / ... time is that each LLM you use takes to respond in your session(s).
* *session browser and annotation*: see all input and output the LLM receives and sends for each NPC in a session, rate it as okay or not okay, comment what is wrong.
* *llm and situation review*: filter by LLM and NPC and see what percentage of okay behavior the NPC had with that LLM, and read the comments to find patterns of improvement ideas. Export to Excel for further analysis.

## Installation

Preparation:
1. install python, if not done already
2. download all files from folder llm_analyzer and put them in a sub-folder of your plugins: \<your-game\>/js/plugins/llm_analyzer

Then set the switch "enable analysis loggin" in the AICharacter plugin to true and play the game as much as you want. You'll notice a new folder \<your-game\>/logs
4. open a terminal in \<your-game\>/js/plugins
5. type: python -m llm_analyzer

And the UI of the tool opens.

## Performance Statistics

The leftmost tab of the tool allows you to view how fast the LLM(s) you are using respond. First use the button "Import performance log ..." to import a performance log file. The file selection dialog should immediately point you to the logs folder of your game and show the single csv file you can select. The tool will then import the contents of the file, ie. your recorded performance data, into its database.

You may want to delete this file after import.

After the tool has read the file, you see a table with performance information about each LLM you have been using so far: LLM name, number of calls to the LLM, min, avg, max time spent in msec, and p90, ie. how long the 90% case took.

![Screenshot Performance Stats](https://github.com/kagsteiner/RPGMaker_AICharacter/blob/acdd6c49b9794f23b18b8f0013d0bb1e7f5782aa/llm_analyzer/tab1.png) Screenshot

This inforamtion can help you choose an LLM that performs best for your game.

## Session Browser & Annotation

The heart of the app. First, again, import a log file that contains all communication with the LLM in the session you have played. If you have played several sessions, pick the one you want to analyze. Once imported, this session is saved to the app's database. You do not need to re-import it, and can delete the file if you wish.

![Screenshot of Session Browser](https://github.com/kagsteiner/RPGMaker_AICharacter/blob/2c149608b682c44bbac91c047bf56fd4b0d7f88b/llm_analyzer/tab2.png) Screenshot

On the left side of the screen you see all imported sessions. Select one of them to analyze and annotate it.

On the right side, you see each interaction one by one. The UI has three sections of text:
1. the exact message sent to the LLM - the NPC description, the prompt for acting towards a goal, the whole history and environment that the LLM knows.
2. the exact message sent back from the LLM - this is a bit hard to read because it is a JSON string that will be interpreted by the Plugin. I'll explain it later.
3. an empty text field where you can enter an annotation.

What you typically do is go through the interactions using the Prev and Next buttons, and mark each of them with "okay" or "not okay". For not okay, you might want to enter an annotation like "The NPC should not have offered to undress". :-)

Once you have annotated your session you want to go to the next screen

## LLM & Situation Review

The third tab helps you find out which NPCs need changes. Select an LLM and an NPC and click "Apply". You will then see a list of all LLM interactions for this NPC, along with an "OK Score", ie. what percentage of its behavior you considered okay, and a full list of the interactions with ok/not okay and annotations.

This often shows immediately what you have to change in the NPC description or the goal description. For more sophisticated analysis you can export this table to a csv file.

