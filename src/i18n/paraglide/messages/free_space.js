/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ space: NonNullable<unknown> }} Free_SpaceInputs */

const uk_free_space = /** @type {(inputs: Free_SpaceInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Вільно: ${i?.space}`)
};

const en_free_space = /** @type {(inputs: Free_SpaceInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Free: ${i?.space}`)
};

/**
* | output |
* | --- |
* | "Free: {space}" |
*
* @param {Free_SpaceInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const free_space = /** @type {((inputs: Free_SpaceInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Free_SpaceInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_free_space(inputs)
	return en_free_space(inputs)
});