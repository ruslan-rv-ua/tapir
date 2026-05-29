/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_Longest_RecordingInputs */

const uk_segment_longest_recording = /** @type {(inputs: Segment_Longest_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Найдовший запис`)
};

const en_segment_longest_recording = /** @type {(inputs: Segment_Longest_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Longest recording`)
};

/**
* | output |
* | --- |
* | "Longest recording" |
*
* @param {Segment_Longest_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_longest_recording = /** @type {((inputs?: Segment_Longest_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_Longest_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_longest_recording(inputs)
	return en_segment_longest_recording(inputs)
});