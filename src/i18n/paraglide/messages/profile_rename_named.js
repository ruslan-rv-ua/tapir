/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Rename_NamedInputs */

const uk_profile_rename_named = /** @type {(inputs: Profile_Rename_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Перейменувати ${i?.name}`)
};

const en_profile_rename_named = /** @type {(inputs: Profile_Rename_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Rename ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Rename {name}" |
*
* @param {Profile_Rename_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_rename_named = /** @type {((inputs: Profile_Rename_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Rename_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_rename_named(inputs)
	return en_profile_rename_named(inputs)
});