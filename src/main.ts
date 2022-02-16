import {
	MarkdownView
} from 'obsidian';

import {
	Calendar,
	ICSSettings,
	DEFAULT_SETTINGS,
} from "./settings/ICSSettings";

import ICSSettingsTab from "./settings/ICSSettingsTab";

import {
	getDateFromFile
} from "obsidian-daily-notes-interface";

import {
	Plugin,
	request,
	normalizePath
} from 'obsidian';
import { parseIcs, filterMatchingEvents } from './icalUtils';

const moment = require('moment');

export default class ICSPlugin extends Plugin {
	data: ICSSettings;

	async addCalendar(calendar: Calendar): Promise<void> {
        this.data.calendars = {
            ...this.data.calendars,
			[calendar.icsName]: calendar
        };
        await this.saveSettings();
    }

	async removeCalendar(calendar: Calendar) {
        if (this.data.calendars[calendar.icsName]) {
            delete this.data.calendars[calendar.icsName];
        }
        await this.saveSettings();
    }

	async onload() {
		console.log('loading ics plugin');
		await this.loadSettings();
		this.addSettingTab(new ICSSettingsTab(this.app, this));
		this.addCommand({
			id: "import_events",
			name: "import events",
			hotkeys: [{
				modifiers: ["Alt", "Shift"],
				key: 'T',
			}, ],
			callback: async () => {
				function getDateFromNote(lineText: string): string | null {

					if (lineText === undefined) {
						debugger;
					}
					console.log(lineText);

					const dateMatch = lineText.match(/^-\s*\[\s*\s*]\s*(\d+:\d+)\s*/);
					if (dateMatch) {
						return dateMatch[1];
					}

					return null;
				}

				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

				// TODO: Make the split character and date format settings value
				const fileDate = moment(activeView.file.basename.split('-')[1], 'YYYYMMDD');
				const mdArray: string[] = [];
				const eventUuid = new Set();

				for (const calendar in this.data.calendars) {
					const calendarSetting = this.data.calendars[calendar];
					console.log(calendarSetting);
					var icsArray: any[] = [];
					var icsArray = parseIcs(await request({
						url: calendarSetting.icsUrl
					}));
					const todayEvents = filterMatchingEvents(icsArray, fileDate);
					console.log(todayEvents);

					todayEvents.forEach((e) => {
						// Prevent duplicate events
						if (!eventUuid.has(e.uid)) {
							eventUuid.add(e.uid);
							mdArray.push(`- [ ] ${moment(e.start).format("HH:mm")} **(${calendarSetting.icsName}) ${e.summary}** ${e.location}`.trim());
							mdArray.push(`- [ ] ${moment(e.end).format("HH:mm")} BREAK`.trim());
						}
					});
				}

				mdArray.sort();

				// TODO: Make template file settings
				const templateContents = await this.app.vault.adapter.read(normalizePath('zz-Templates/Day Planner.md'));

				const templateLines = templateContents.split('\n');
				const result: string[] = [];
				let lastCalendarTime: string;
				let currCalendarIdx = 0;
				let currCalendarLine = mdArray[currCalendarIdx];
				let currCalendarTime = currCalendarLine != undefined ? getDateFromNote(currCalendarLine) : '';
				templateLines.forEach((templateLine: string): void => {
					const lineTime = getDateFromNote(templateLine);

					while (lineTime && currCalendarIdx < mdArray.length && lineTime > currCalendarTime) {
						// Push in start time
						result.push(currCalendarLine);

						// Push in end time
						currCalendarLine = mdArray[currCalendarIdx + 1];
						result.push(currCalendarLine);
						lastCalendarTime = getDateFromNote(currCalendarLine);

						// Set next start event
						currCalendarIdx += 2;
						currCalendarLine = mdArray[currCalendarIdx];
						currCalendarTime = currCalendarLine != undefined ? getDateFromNote(currCalendarLine) : '';
					}

					// Delete this line-item if it overlaps with the last calendar event
					if (lineTime && lastCalendarTime && lineTime <= lastCalendarTime) {
						templateLine = '';
					}

					result.push(templateLine.replaceAll(/{{date:(.*)}}/g, (_match, p1) => {
						return moment().format(p1);
					}));
				});

				activeView.editor.replaceRange(result.join('\n'), activeView.editor.getCursor());
			}
		});
	}

	onunload() {
		console.log('unloading ics plugin');
	}

	async loadSettings() {
		this.data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.data);
	}
}


