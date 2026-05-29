/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_TrackInputs */

const uk_column_track = /** @type {(inputs: Column_TrackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Поточний трек`)
};

const en_column_track = /** @type {(inputs: Column_TrackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Current track`)
};

/**
* | output |
* | --- |
* | "Current track" |
*
* @param {Column_TrackInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_track = /** @type {((inputs?: Column_TrackInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_TrackInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_track(inputs)
	return en_column_track(inputs)
});