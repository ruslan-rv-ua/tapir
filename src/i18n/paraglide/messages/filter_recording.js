/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Filter_RecordingInputs */

const uk_filter_recording = /** @type {(inputs: Filter_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Записуються`)
};

const en_filter_recording = /** @type {(inputs: Filter_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording`)
};

/**
* | output |
* | --- |
* | "Recording" |
*
* @param {Filter_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const filter_recording = /** @type {((inputs?: Filter_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Filter_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_filter_recording(inputs)
	return en_filter_recording(inputs)
});