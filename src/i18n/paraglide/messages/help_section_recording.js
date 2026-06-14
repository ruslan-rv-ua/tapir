/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_RecordingInputs */

const uk_help_section_recording = /** @type {(inputs: Help_Section_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Запис`)
};

const en_help_section_recording = /** @type {(inputs: Help_Section_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording`)
};

/**
* | output |
* | --- |
* | "Recording" |
*
* @param {Help_Section_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_recording = /** @type {((inputs?: Help_Section_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_recording(inputs)
	return en_help_section_recording(inputs)
});