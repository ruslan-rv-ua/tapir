/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Songs_Loaded_FewInputs */

const uk_songs_loaded_few = /** @type {(inputs: Songs_Loaded_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Знайдено ${i?.count} записи`)
};

const en_songs_loaded_few = /** @type {(inputs: Songs_Loaded_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Found ${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "Found {count} recordings" |
*
* @param {Songs_Loaded_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_loaded_few = /** @type {((inputs: Songs_Loaded_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Loaded_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_loaded_few(inputs)
	return en_songs_loaded_few(inputs)
});