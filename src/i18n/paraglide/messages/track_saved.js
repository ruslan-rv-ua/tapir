/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ fileName: NonNullable<unknown>, name: NonNullable<unknown> }} Track_SavedInputs */

const uk_track_saved = /** @type {(inputs: Track_SavedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Трек збережено: ${i?.fileName} (${i?.name})`)
};

const en_track_saved = /** @type {(inputs: Track_SavedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Track saved: ${i?.fileName} (${i?.name})`)
};

/**
* | output |
* | --- |
* | "Track saved: {fileName} ({name})" |
*
* @param {Track_SavedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const track_saved = /** @type {((inputs: Track_SavedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Track_SavedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_track_saved(inputs)
	return en_track_saved(inputs)
});