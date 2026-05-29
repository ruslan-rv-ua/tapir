/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Start_RecordingInputs */

const uk_start_recording = /** @type {(inputs: Start_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Почати запис`)
};

const en_start_recording = /** @type {(inputs: Start_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Start recording`)
};

/**
* | output |
* | --- |
* | "Start recording" |
*
* @param {Start_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const start_recording = /** @type {((inputs?: Start_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Start_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_start_recording(inputs)
	return en_start_recording(inputs)
});