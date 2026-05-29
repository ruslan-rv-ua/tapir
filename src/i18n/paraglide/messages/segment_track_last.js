/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ track: NonNullable<unknown> }} Segment_Track_LastInputs */

const uk_segment_track_last = /** @type {(inputs: Segment_Track_LastInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Востаннє грав: ${i?.track}`)
};

const en_segment_track_last = /** @type {(inputs: Segment_Track_LastInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Last played: ${i?.track}`)
};

/**
* | output |
* | --- |
* | "Last played: {track}" |
*
* @param {Segment_Track_LastInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_track_last = /** @type {((inputs: Segment_Track_LastInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_Track_LastInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_track_last(inputs)
	return en_segment_track_last(inputs)
});