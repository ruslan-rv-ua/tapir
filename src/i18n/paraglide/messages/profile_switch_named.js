/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Switch_NamedInputs */

const uk_profile_switch_named = /** @type {(inputs: Profile_Switch_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Перемкнутися на ${i?.name}`)
};

const en_profile_switch_named = /** @type {(inputs: Profile_Switch_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Switch to ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Switch to {name}" |
*
* @param {Profile_Switch_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_switch_named = /** @type {((inputs: Profile_Switch_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Switch_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_switch_named(inputs)
	return en_profile_switch_named(inputs)
});