/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Duplicate_NamedInputs */

const uk_profile_duplicate_named = /** @type {(inputs: Profile_Duplicate_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Дублювати ${i?.name}`)
};

const en_profile_duplicate_named = /** @type {(inputs: Profile_Duplicate_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Duplicate ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Duplicate {name}" |
*
* @param {Profile_Duplicate_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_duplicate_named = /** @type {((inputs: Profile_Duplicate_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Duplicate_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_duplicate_named(inputs)
	return en_profile_duplicate_named(inputs)
});