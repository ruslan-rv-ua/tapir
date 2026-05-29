/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ error: NonNullable<unknown> }} Songs_Toast_FailedInputs */

const uk_songs_toast_failed = /** @type {(inputs: Songs_Toast_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Не вдалось виконати дію: ${i?.error}`)
};

const en_songs_toast_failed = /** @type {(inputs: Songs_Toast_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Action failed: ${i?.error}`)
};

/**
* | output |
* | --- |
* | "Action failed: {error}" |
*
* @param {Songs_Toast_FailedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_toast_failed = /** @type {((inputs: Songs_Toast_FailedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Toast_FailedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_toast_failed(inputs)
	return en_songs_toast_failed(inputs)
});