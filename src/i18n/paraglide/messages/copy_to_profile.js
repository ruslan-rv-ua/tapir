/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Copy_To_ProfileInputs */

const uk_copy_to_profile = /** @type {(inputs: Copy_To_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Копіювати в профіль…`)
};

const en_copy_to_profile = /** @type {(inputs: Copy_To_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Copy to profile…`)
};

/**
* | output |
* | --- |
* | "Copy to profile…" |
*
* @param {Copy_To_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const copy_to_profile = /** @type {((inputs?: Copy_To_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Copy_To_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_copy_to_profile(inputs)
	return en_copy_to_profile(inputs)
});