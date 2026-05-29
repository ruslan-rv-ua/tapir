/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_RecordingInputs */

const uk_status_recording = /** @type {(inputs: Status_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`REC`)
};

const en_status_recording = /** @type {(inputs: Status_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`REC`)
};

/**
* | output |
* | --- |
* | "REC" |
*
* @param {Status_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_recording = /** @type {((inputs?: Status_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_recording(inputs)
	return en_status_recording(inputs)
});