/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stop_RecordingInputs */

const uk_stop_recording = /** @type {(inputs: Stop_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити запис`)
};

const en_stop_recording = /** @type {(inputs: Stop_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop recording`)
};

/**
* | output |
* | --- |
* | "Stop recording" |
*
* @param {Stop_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop_recording = /** @type {((inputs?: Stop_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stop_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop_recording(inputs)
	return en_stop_recording(inputs)
});